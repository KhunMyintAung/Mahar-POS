import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { nextNumber } from "@/lib/sequence";
import { postLedger, reverseLedgerEntries } from "./walletService";
import { assertDateOpen } from "./closeGuard";
import { audit } from "@/lib/audit";
import { businessDateOf } from "@/lib/dates";
import { ensureStandardCategories } from "@/lib/incomeCategories";
import { businessCurrency } from "@/services/currencyService";

// Shared by the HTTP API and the Telegram bot so both stay in lockstep.
// WITHDRAW behaves like EXPENSE (money leaves the wallet) but is tracked as
// its own type so reports can tell owner drawings apart from operating costs.

export async function createIncomeExpenseEntry(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    type: "INCOME" | "EXPENSE" | "WITHDRAW";
    categoryName?: string;
    amount: bigint;
    walletId: string;
    date: string;
    reference?: string;
    description?: string;
    /** The supplier an expense was paid to. */
    supplierId?: string;
    /** What leaves the wallet now, when less than the amount: a salary whose advance was
     *  paid out earlier counts in full as expense but only the rest leaves the wallet. */
    moneyOut?: bigint;
  }
) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  if (opts.type !== "WITHDRAW" && !opts.categoryName?.trim())
    throw new ApiError(422, "A category is required");

  await assertDateOpen(tx, opts.branchId, opts.date);
  const wallet = await tx.wallet.findUnique({ where: { id: opts.walletId } });
  if (
    !wallet ||
    wallet.businessId !== opts.businessId ||
    wallet.branchId !== opts.branchId ||
    wallet.deletedAt
  ) {
    throw new ApiError(404, "Wallet not found");
  }
  if (!wallet.active) throw new ApiError(422, `Wallet ${wallet.name} is inactive`);
  if (opts.supplierId) {
    if (opts.type !== "EXPENSE") throw new ApiError(422, "Only an expense can be paid to a supplier");
    const supplier = await tx.contact.findFirst({
      where: { id: opts.supplierId, businessId: opts.businessId, type: "SUPPLIER", deletedAt: null },
      select: { id: true },
    });
    if (!supplier) throw new ApiError(404, "Supplier not found");
  }

  const categoryName = opts.categoryName?.trim() || "Withdrawal";
  const txnNo = await nextNumber(tx, opts.businessId, opts.type);
  const it = await tx.incomeExpense.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      type: opts.type,
      categoryName,
      amount: opts.amount,
      currency: wallet.currency,
      walletId: opts.walletId,
      date: opts.date,
      reference: opts.reference,
      description: opts.description,
      supplierId: opts.supplierId,
      createdById: opts.userId,
    },
  });

  const moved = opts.moneyOut ?? opts.amount;
  if (moved > 0n) await postLedger(tx, {
    businessId: opts.businessId,
    walletId: wallet.id,
    direction: opts.type === "INCOME" ? "DEBIT" : "CREDIT",
    amount: moved,
    refType: opts.type,
    refId: it.id,
    description: `${txnNo} ${categoryName}`,
    createdById: opts.userId,
  });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: opts.branchId,
    action: "CREATE", module: opts.type === "WITHDRAW" ? "wallet" : "income_expense",
    resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo, type: opts.type, category: categoryName, amount: opts.amount },
  });
  return it;
}

/** Void an income/expense/withdraw entry: reverses the single wallet movement it posted. */
export async function reverseIncomeExpense(
  tx: Tx,
  opts: { id: string; reason: string; userId: string; businessId: string }
) {
  const it = await tx.incomeExpense.findUnique({ where: { id: opts.id } });
  if (!it || it.businessId !== opts.businessId || it.deletedAt) throw new ApiError(404, "Record not found");
  if (it.status === "REVERSED") throw new ApiError(422, "Already reversed");
  if (!opts.reason.trim()) throw new ApiError(422, "A reason is required");
  // Reversing takes the entry off its own day: a closed day's figures stay as they were
  // closed unless the day is reopened first (which is logged).
  await assertDateOpen(tx, it.branchId, it.date);

  // A float or stock purchase record moved no money of its own (the purchase did), so nothing to undo.
  if (!it.billerTxnId && !it.purchaseId && !it.payablePaymentId) await reverseLedgerEntries(tx, opts.businessId, it.type, it.id, opts.userId, opts.reason);

  await tx.incomeExpense.update({ where: { id: it.id }, data: { status: "REVERSED" } });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: it.branchId,
    action: "REVERSE", module: it.type === "WITHDRAW" ? "wallet" : "income_expense",
    resourceType: "IncomeExpense", resourceId: it.id,
    reason: opts.reason,
    before: { status: it.status, type: it.type, amount: it.amount },
  });
}

/** Records a biller float purchase as an expense (Daily Bill Expense), on the owner's say-so
 *  after "Bought float". The purchase already took the cash out of the wallet, so this entry
 *  moves no money: it is the record that puts the cost in Income & Expense and in Reports,
 *  where it stands in for the top-up cost estimated from sales. One record per purchase. */
export async function recordFloatExpense(tx: Tx, opts: { businessId: string; userId: string; billerTxnId: string }) {
  const txn = await tx.billerTxn.findFirst({ where: { id: opts.billerTxnId, businessId: opts.businessId }, include: { biller: true } });
  if (!txn) throw new ApiError(404, "Float purchase not found");
  if (txn.kind !== "TOPUP") throw new ApiError(422, "Only a float purchase can be recorded as expense");
  if (txn.voidedAt) throw new ApiError(422, `${txn.txnNo} is voided`);
  if (txn.cashAmount <= 0n || !txn.walletId) throw new ApiError(422, "This purchase has no cash paid to record");
  const existing = await tx.incomeExpense.findUnique({ where: { billerTxnId: txn.id } });
  if (existing && existing.status !== "REVERSED") return existing;

  await ensureStandardCategories(tx, opts.businessId);
  const category = await tx.category.findFirst({ where: { businessId: opts.businessId, type: "EXPENSE", systemKey: "DAILY_BILL" } });
  const wallet = await tx.wallet.findUnique({ where: { id: txn.walletId } });
  if (!wallet) throw new ApiError(404, "Wallet not found");
  const date = businessDateOf(txn.createdAt);
  // The wallet's branch, else the purchase's, else the shop's first branch.
  const branchId = wallet.branchId ?? txn.branchId ?? (await tx.branch.findFirst({ where: { businessId: opts.businessId }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!branchId) throw new ApiError(422, "No branch to file the expense under");
  const categoryName = category?.name ?? "Daily Bill Expense";
  const description = `Bought float · ${txn.biller.name} (${txn.txnNo})`;

  const it = existing
    // Recorded before, then reversed: bring the same record back.
    ? await tx.incomeExpense.update({ where: { id: existing.id }, data: { status: "COMPLETED", amount: txn.cashAmount, categoryName, description } })
    : await tx.incomeExpense.create({
        data: {
          txnNo: await nextNumber(tx, opts.businessId, "EXPENSE"),
          businessId: opts.businessId,
          branchId,
          type: "EXPENSE",
          categoryId: category?.id,
          categoryName,
          amount: txn.cashAmount,
          currency: wallet.currency,
          walletId: wallet.id,
          date,
          reference: txn.txnNo,
          description,
          billerTxnId: txn.id,
          createdById: opts.userId,
        },
      });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId,
    action: "CREATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo: it.txnNo, type: "EXPENSE", category: categoryName, amount: txn.cashAmount, floatPurchase: txn.txnNo },
  });
  return it;
}

/** Records a stock purchase as an expense — Daily Sale Expense for goods to sell, Daily
 *  Service Expense for parts used in repairs — on the owner's say-so after saving it. Like
 *  the float record it moves no money — the purchase paid (or owes) the supplier — and in
 *  Reports it stands in for that side's cost. One per purchase; asking again with the other
 *  side moves the record there. */
export async function recordPurchaseExpense(tx: Tx, opts: { businessId: string; userId: string; purchaseId: string; line?: "SALE" | "SERVICE" }) {
  const line = opts.line ?? "SALE";
  const purchase = await tx.purchase.findFirst({ where: { id: opts.purchaseId, businessId: opts.businessId, deletedAt: null } });
  if (!purchase) throw new ApiError(404, "Purchase not found");
  if (purchase.status !== "COMPLETED") throw new ApiError(422, `${purchase.txnNo} is cancelled`);
  if (purchase.total <= 0n) throw new ApiError(422, "This purchase has nothing to record (all FOC)");
  const existing = await tx.incomeExpense.findUnique({ where: { purchaseId: purchase.id } });

  await ensureStandardCategories(tx, opts.businessId);
  const category = await tx.category.findFirst({ where: { businessId: opts.businessId, type: "EXPENSE", systemKey: line === "SERVICE" ? "DAILY_SERVICE" : "DAILY_SALE" } });
  const fallbackName = line === "SERVICE" ? "Daily Service Expense" : "Daily Sale Expense";
  if (purchase.line !== line) await tx.purchase.update({ where: { id: purchase.id }, data: { line } });
  // The expenses of payments made since (a purchase on credit) move with it.
  const later = await tx.incomeExpense.findMany({ where: { businessId: opts.businessId, fromPurchaseId: purchase.id, status: "COMPLETED" } });
  if (category) {
    for (const e of later.filter((x) => x.categoryId !== category.id)) {
      await tx.incomeExpense.update({ where: { id: e.id }, data: { categoryId: category.id, categoryName: category.name } });
    }
  }
  if (existing && existing.status !== "REVERSED") {
    if (!category || existing.categoryId === category.id) return existing;
    // Filed under the other side: move it (no money moves, so nothing else changes).
    const moved = await tx.incomeExpense.update({ where: { id: existing.id }, data: { categoryId: category.id, categoryName: category.name } });
    await audit(tx, {
      businessId: opts.businessId, userId: opts.userId, branchId: purchase.branchId,
      action: "UPDATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: existing.id,
      before: { category: existing.categoryName }, after: { category: category.name, purchase: purchase.txnNo },
    });
    return moved;
  }
  // Expense is money actually paid: what was paid at purchase. A purchase on credit goes in
  // as the supplier is paid (recordPayablePaymentExpense), so it is not asked about here.
  // Nothing paid yet: only the side is kept, for when the supplier is paid.
  if (purchase.paidAmount <= 0n) return later[0] ?? null;
  // The wallet that paid, or for a purchase on credit the branch's first MMK wallet.
  const wallet = purchase.walletId
    ? await tx.wallet.findUnique({ where: { id: purchase.walletId } })
    : await tx.wallet.findFirst({ where: { businessId: opts.businessId, branchId: purchase.branchId, currency: await businessCurrency(opts.businessId, tx), deletedAt: null }, orderBy: { createdAt: "asc" } })
      ?? await tx.wallet.findFirst({ where: { businessId: opts.businessId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  if (!wallet) throw new ApiError(422, "Add a wallet first");
  const supplier = purchase.supplierId ? await tx.contact.findUnique({ where: { id: purchase.supplierId }, select: { name: true } }) : null;
  const categoryName = category?.name ?? fallbackName;
  const description = `Stock purchase ${purchase.txnNo}${supplier ? ` · ${supplier.name}` : ""}`;

  const it = existing
    ? await tx.incomeExpense.update({ where: { id: existing.id }, data: { status: "COMPLETED", amount: purchase.paidAmount, categoryId: category?.id, categoryName, description } })
    : await tx.incomeExpense.create({
        data: {
          txnNo: await nextNumber(tx, opts.businessId, "EXPENSE"),
          businessId: opts.businessId,
          branchId: purchase.branchId,
          type: "EXPENSE",
          categoryId: category?.id,
          categoryName,
          amount: purchase.paidAmount,
          currency: wallet.currency,
          walletId: wallet.id,
          date: purchase.date,
          reference: purchase.txnNo,
          description,
          purchaseId: purchase.id,
          createdById: opts.userId,
        },
      });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: purchase.branchId,
    action: "CREATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo: it.txnNo, type: "EXPENSE", category: categoryName, amount: purchase.paidAmount, purchase: purchase.txnNo },
  });
  return it;
}

/** A payment to a supplier for a purchase on credit: its cost goes into expense on the day
 *  paid (Daily Sale or Daily Service, as the purchase was bought for). The payment already
 *  took the money out of the wallet, so this entry moves none. Never more than the part of
 *  the purchase not yet in expense, so one recorded in full earlier is not counted twice. */
export async function recordPayablePaymentExpense(tx: Tx, opts: {
  businessId: string; userId: string; payableId: string; paymentId: string; amount: bigint; walletId: string; date: string;
}) {
  const purchase = await tx.purchase.findFirst({ where: { businessId: opts.businessId, payableId: opts.payableId, deletedAt: null, status: "COMPLETED" } });
  if (!purchase) return null;
  const recorded = await tx.incomeExpense.aggregate({
    where: { businessId: opts.businessId, status: "COMPLETED", type: "EXPENSE", OR: [{ purchaseId: purchase.id }, { fromPurchaseId: purchase.id }] },
    _sum: { amount: true },
  });
  const left = purchase.total - (recorded._sum.amount ?? 0n);
  const amount = opts.amount < left ? opts.amount : left;
  if (amount <= 0n) return null;

  await ensureStandardCategories(tx, opts.businessId);
  const line = purchase.line === "SERVICE" ? "SERVICE" : "SALE";
  const category = await tx.category.findFirst({ where: { businessId: opts.businessId, type: "EXPENSE", systemKey: line === "SERVICE" ? "DAILY_SERVICE" : "DAILY_SALE" } });
  const categoryName = category?.name ?? (line === "SERVICE" ? "Daily Service Expense" : "Daily Sale Expense");
  const wallet = await tx.wallet.findUnique({ where: { id: opts.walletId } });
  const it = await tx.incomeExpense.create({
    data: {
      txnNo: await nextNumber(tx, opts.businessId, "EXPENSE"),
      businessId: opts.businessId,
      branchId: purchase.branchId,
      type: "EXPENSE",
      categoryId: category?.id,
      categoryName,
      amount,
      currency: wallet?.currency ?? (await businessCurrency(opts.businessId, tx)),
      walletId: opts.walletId,
      date: opts.date,
      reference: purchase.txnNo,
      description: `Supplier paid for ${purchase.txnNo}`,
      supplierId: purchase.supplierId,
      payablePaymentId: opts.paymentId,
      fromPurchaseId: purchase.id,
      createdById: opts.userId,
    },
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: purchase.branchId,
    action: "CREATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo: it.txnNo, type: "EXPENSE", category: categoryName, amount, purchase: purchase.txnNo, payment: opts.paymentId },
  });
  return it;
}

/** Income the app files by itself, each under a category of its own that the shop can rename
 *  but not delete: the profit on a bill sale, and the fee on a money transfer or cash-out.
 *  Neither is one of the standard daily categories, so both count as Other income. */
export const AUTO_INCOME_CATEGORIES = { BILL_PROFIT: "Bill Profit", MONEY_FEE: "Transfer & Cash-out Fee" } as const;
export type AutoIncomeKey = keyof typeof AUTO_INCOME_CATEGORIES;

/** Expense the app files by itself: the fee a bank or wallet charges on a transfer between
 *  the shop's own wallets. Not a standard daily category, so it counts as a general expense. */
export const AUTO_EXPENSE_CATEGORIES = { TRANSFER_FEE: "Transfer Fee" } as const;
export type AutoExpenseKey = keyof typeof AUTO_EXPENSE_CATEGORIES;

async function autoCategory(tx: Tx, businessId: string, type: "INCOME" | "EXPENSE", key: string, name: string) {
  const keyed = await tx.category.findFirst({ where: { businessId, type, systemKey: key } });
  if (keyed) return keyed.active ? keyed : tx.category.update({ where: { id: keyed.id }, data: { active: true } });
  // One the shop already made by hand under the same name takes the key rather than being doubled.
  const named = await tx.category.findFirst({ where: { businessId, type, name } });
  if (named && !named.systemKey) return tx.category.update({ where: { id: named.id }, data: { systemKey: key, active: true } });
  return tx.category.create({ data: { businessId, type, name: named ? `${name} (auto)` : name, systemKey: key } });
}

const autoIncomeCategory = (tx: Tx, businessId: string, key: AutoIncomeKey) =>
  autoCategory(tx, businessId, "INCOME", key, AUTO_INCOME_CATEGORIES[key]);

/** The branch to file an entry under: the wallet's, else the record's, else the shop's first. */
async function entryBranch(tx: Tx, businessId: string, ...candidates: (string | null | undefined)[]) {
  const id = candidates.find(Boolean)
    ?? (await tx.branch.findFirst({ where: { businessId }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!id) throw new ApiError(422, "No branch to file the income under");
  return id;
}

/** The profit on a bill sale as income (Bill Profit, under Other income), filed with every
 *  sale that makes one. The sale already put its cash in the wallet, so this entry moves no
 *  money: it is the record that shows the profit in Income & Expense and in Reports, where
 *  the sale's cash then counts as the operator's money passing through. */
export async function recordBillProfitIncome(tx: Tx, opts: { businessId: string; userId: string; billerTxnId: string }) {
  const txn = await tx.billerTxn.findFirst({ where: { id: opts.billerTxnId, businessId: opts.businessId }, include: { biller: true } });
  if (!txn || txn.kind !== "SALE" || txn.voidedAt || txn.profit <= 0n || !txn.walletId) return null;
  const wallet = await tx.wallet.findUnique({ where: { id: txn.walletId } });
  if (!wallet) return null;
  const category = await autoIncomeCategory(tx, opts.businessId, "BILL_PROFIT");
  const branchId = await entryBranch(tx, opts.businessId, wallet.branchId, txn.branchId);
  const it = await tx.incomeExpense.create({
    data: {
      txnNo: await nextNumber(tx, opts.businessId, "INCOME"),
      businessId: opts.businessId,
      branchId,
      type: "INCOME",
      categoryId: category.id,
      categoryName: category.name,
      amount: txn.profit,
      currency: wallet.currency,
      walletId: wallet.id,
      date: businessDateOf(txn.createdAt),
      reference: txn.txnNo,
      description: `Bill sale · ${txn.biller.name} (${txn.txnNo})`,
      billerTxnId: txn.id,
      createdById: opts.userId,
    },
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId,
    action: "CREATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo: it.txnNo, type: "INCOME", category: category.name, amount: txn.profit, billSale: txn.txnNo },
  });
  return it;
}

/** The fee paid on a transfer between the shop's own wallets, as an expense (Transfer Fee)
 *  out of the wallet that paid it. The amount moved is not an expense (it is still the
 *  shop's money, now in the other wallet); the fee is money gone, so it is. */
export async function recordTransferFeeExpense(
  tx: Tx,
  opts: { businessId: string; userId: string; amount: bigint; walletId: string; date: string; reference: string; description: string }
) {
  const wallet = await tx.wallet.findUnique({ where: { id: opts.walletId } });
  if (!wallet || wallet.businessId !== opts.businessId) throw new ApiError(404, "Wallet not found");
  const category = await autoCategory(tx, opts.businessId, "EXPENSE", "TRANSFER_FEE", AUTO_EXPENSE_CATEGORIES.TRANSFER_FEE);
  const branchId = await entryBranch(tx, opts.businessId, wallet.branchId);
  const txnNo = await nextNumber(tx, opts.businessId, "EXPENSE");
  const it = await tx.incomeExpense.create({
    data: {
      txnNo, businessId: opts.businessId, branchId, type: "EXPENSE",
      categoryId: category.id, categoryName: category.name,
      amount: opts.amount, currency: wallet.currency, walletId: wallet.id,
      date: opts.date, reference: opts.reference, description: opts.description,
      createdById: opts.userId,
    },
  });
  await postLedger(tx, {
    businessId: opts.businessId, walletId: wallet.id, direction: "CREDIT", amount: opts.amount,
    refType: "EXPENSE", refId: it.id, description: `${txnNo} ${category.name}`, createdById: opts.userId,
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId,
    action: "CREATE", module: "income_expense", resourceType: "IncomeExpense", resourceId: it.id,
    after: { txnNo, type: "EXPENSE", category: category.name, amount: opts.amount, transfer: opts.reference },
  });
  return it;
}

/** A fee the shop earned, as income into the wallet that took it (Transfer & Cash-out Fee). */
export async function recordFeeIncome(
  tx: Tx,
  opts: { businessId: string; userId: string; branchId?: string | null; amount: bigint; walletId: string; date: string; reference: string; description: string }
) {
  const wallet = await tx.wallet.findUnique({ where: { id: opts.walletId } });
  if (!wallet || wallet.businessId !== opts.businessId) throw new ApiError(404, "Wallet not found");
  const category = await autoIncomeCategory(tx, opts.businessId, "MONEY_FEE");
  const branchId = await entryBranch(tx, opts.businessId, wallet.branchId, opts.branchId);
  const txnNo = await nextNumber(tx, opts.businessId, "INCOME");
  const it = await tx.incomeExpense.create({
    data: {
      txnNo, businessId: opts.businessId, branchId, type: "INCOME",
      categoryId: category.id, categoryName: category.name,
      amount: opts.amount, currency: wallet.currency, walletId: wallet.id,
      date: opts.date, reference: opts.reference, description: opts.description,
      createdById: opts.userId,
    },
  });
  await postLedger(tx, {
    businessId: opts.businessId, walletId: wallet.id, direction: "DEBIT", amount: opts.amount,
    refType: "INCOME", refId: it.id, description: `${txnNo} ${category.name}`, createdById: opts.userId,
  });
  return it;
}

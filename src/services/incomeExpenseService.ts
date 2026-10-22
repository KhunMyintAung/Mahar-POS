import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { nextNumber } from "@/lib/sequence";
import { postLedger, reverseLedgerEntries } from "./walletService";
import { assertDateOpen } from "./closeGuard";
import { audit } from "@/lib/audit";
import { businessDateOf } from "@/lib/dates";
import { ensureStandardCategories } from "@/lib/incomeCategories";

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
      createdById: opts.userId,
    },
  });

  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: wallet.id,
    direction: opts.type === "INCOME" ? "DEBIT" : "CREDIT",
    amount: opts.amount,
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

  // A float-purchase record moved no money of its own (the purchase did), so nothing to undo.
  if (!it.billerTxnId) await reverseLedgerEntries(tx, opts.businessId, it.type, it.id, opts.userId, opts.reason);

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

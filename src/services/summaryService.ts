import { Tx } from "@/lib/prisma";
import { dateRangeUtc } from "@/lib/dates";
import { bucketForKey } from "@/lib/incomeCategories";

// Computes the daily business summary used by both the dashboard and daily close.

export interface DaySummary {
  /** thbWallets lets screens hide the THB figure for a shop that never set up a THB wallet. */
  wallets: { totalMmk: bigint; totalThb: bigint; thbWallets: number; lowBalance: { id: string; name: string; currentBalance: bigint; minBalance: bigint }[] };
  credit: { newIssued: bigint; collected: bigint; outstanding: bigint };
  payable: { newIssued: bigint; paid: bigint; outstanding: bigint };
  general: { otherIncome: bigint; expense: bigint; netCashMovement: bigint };
}

export async function computeDaySummary(
  tx: Tx,
  businessId: string,
  date: string,
  branchIds?: string[] // undefined = all branches
): Promise<DaySummary> {
  const range = dateRangeUtc(date);
  const branchFilter = branchIds ? { branchId: { in: branchIds } } : {};

  // --- Wallets
  const wallets = await tx.wallet.findMany({
    where: { businessId, deletedAt: null, active: true, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: { id: true, name: true, currency: true, currentBalance: true, minBalance: true },
  });
  let totalMmk = 0n, totalThb = 0n, thbWallets = 0;
  const lowBalance = [];
  for (const w of wallets) {
    if (w.currency === "MMK") totalMmk += w.currentBalance;
    if (w.currency === "THB") { totalThb += w.currentBalance; thbWallets++; }
    if (w.minBalance > 0n && w.currentBalance < w.minBalance) {
      lowBalance.push({ id: w.id, name: w.name, currentBalance: w.currentBalance, minBalance: w.minBalance });
    }
  }

  // --- Credit / Payable
  const [newCredit, collected, outstandingCredit, newPayable, paidPayable, outstandingPayable] =
    await Promise.all([
      tx.receivable.aggregate({
        where: { businessId, deletedAt: null, creditDate: date, ...branchFilter },
        _sum: { originalAmount: true },
      }),
      tx.receivablePayment.aggregate({
        where: { date, receivable: { businessId, ...branchFilter } },
        _sum: { amount: true },
      }),
      tx.receivable.aggregate({
        where: { businessId, deletedAt: null, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] }, ...branchFilter },
        _sum: { remainingAmount: true },
      }),
      tx.payable.aggregate({
        where: { businessId, deletedAt: null, payableDate: date, ...branchFilter },
        _sum: { originalAmount: true },
      }),
      tx.payablePayment.aggregate({
        where: { date, payable: { businessId, ...branchFilter } },
        _sum: { amount: true },
      }),
      tx.payable.aggregate({
        where: { businessId, deletedAt: null, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] }, ...branchFilter },
        _sum: { remainingAmount: true },
      }),
    ]);

  // --- Income / Expense
  const [income, expense] = await Promise.all([
    tx.incomeExpense.aggregate({
      where: { businessId, deletedAt: null, type: "INCOME", status: "COMPLETED", date, ...branchFilter },
      _sum: { amount: true },
    }),
    tx.incomeExpense.aggregate({
      where: { businessId, deletedAt: null, type: "EXPENSE", status: "COMPLETED", date, ...branchFilter },
      _sum: { amount: true },
    }),
  ]);

  // Net cash movement from the ledger for the date
  const ledger = await tx.walletLedgerEntry.findMany({
    where: { businessId, createdAt: range, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: { direction: true, amount: true },
  });
  let netCash = 0n;
  for (const l of ledger) netCash += l.direction === "DEBIT" ? l.amount : -l.amount;

  return {
    wallets: { totalMmk, totalThb, thbWallets, lowBalance },
    credit: {
      newIssued: newCredit._sum.originalAmount ?? 0n,
      collected: collected._sum.amount ?? 0n,
      outstanding: outstandingCredit._sum.remainingAmount ?? 0n,
    },
    payable: {
      newIssued: newPayable._sum.originalAmount ?? 0n,
      paid: paidPayable._sum.amount ?? 0n,
      outstanding: outstandingPayable._sum.remainingAmount ?? 0n,
    },
    general: {
      otherIncome: income._sum.amount ?? 0n,
      expense: expense._sum.amount ?? 0n,
      netCashMovement: netCash,
    },
  };
}

/** One line of a day's money: where it came from (or went), and how much. */
export interface DayLine { label: string; amount: bigint }

export interface DayIncome {
  sales: bigint; service: bigint; topup: bigint; other: bigint; total: bigint;
  /** Each source on its own: till sales, repairs, top-up sales and every income category entered. */
  lines: DayLine[];
}

/** Everything the shop took in on a day, in one figure: till sales, repair money taken
 *  (deposits and payments, less refunds), the cash from top-up sales, and other income.
 *  Income entered under the Daily Sale / Daily Service categories counts with sales and
 *  service. Shared by the dashboard and the Telegram daily report so they always agree. */
export async function computeDayIncome(
  tx: Tx,
  businessId: string,
  date: string,
  branchIds?: string[],
  salesTotal?: bigint
): Promise<DayIncome> {
  const range = dateRangeUtc(date);
  const branch = branchIds ? { branchId: { in: branchIds } } : {};
  const [repairIn, repairOut, topup, sales, incomeByCategory, keyed] = await Promise.all([
    tx.walletLedgerEntry.aggregate({
      where: { businessId, direction: "DEBIT", createdAt: range, refType: { in: ["REPAIR_DEPOSIT", "REPAIR_PAYMENT"] }, wallet: { currency: "MMK" }, ...branch },
      _sum: { amount: true },
    }),
    tx.walletLedgerEntry.aggregate({
      where: { businessId, direction: "CREDIT", createdAt: range, refType: { in: ["REPAIR_DEPOSIT", "REPAIR_PAYMENT"] }, wallet: { currency: "MMK" }, ...branch },
      _sum: { amount: true },
    }),
    tx.billerTxn.aggregate({
      where: { businessId, voidedAt: null, createdAt: range, kind: "SALE", ...branch },
      _sum: { cashAmount: true },
    }),
    salesTotal !== undefined
      ? Promise.resolve(salesTotal)
      : tx.sale.aggregate({
          where: { businessId, deletedAt: null, status: "COMPLETED", date, ...branch },
          _sum: { total: true },
        }).then((a) => a._sum.total ?? 0n),
    tx.incomeExpense.groupBy({
      by: ["categoryName"],
      where: { businessId, deletedAt: null, type: "INCOME", status: "COMPLETED", date, currency: "MMK", ...branch },
      _sum: { amount: true },
    }),
    // Entries carry the category's name; the standard ones are told apart by their key, so
    // a renamed "Daily Sale Income" still counts with sales.
    tx.category.findMany({ where: { businessId, type: "INCOME", systemKey: { not: null } }, select: { name: true, systemKey: true } }),
  ]);
  const keyOf = new Map(keyed.map((c) => [c.name.toLowerCase(), c.systemKey]));
  const byBucket = { sales: 0n, service: 0n, topup: 0n, other: 0n };
  for (const row of incomeByCategory) byBucket[bucketForKey(keyOf.get((row.categoryName ?? "").toLowerCase()))] += row._sum.amount ?? 0n;
  const repair = (repairIn._sum.amount ?? 0n) - (repairOut._sum.amount ?? 0n);
  const topupSales = topup._sum.cashAmount ?? 0n;
  const out = {
    sales: sales + byBucket.sales,
    service: repair + byBucket.service,
    topup: topupSales + byBucket.topup,
    other: byBucket.other,
  };
  const lines: DayLine[] = [
    { label: "POS sales", amount: sales },
    { label: "Repairs", amount: repair },
    { label: "Top-up & Bill sales", amount: topupSales },
    ...incomeByCategory.map((row) => ({ label: row.categoryName ?? "Other income", amount: row._sum.amount ?? 0n })),
  ].filter((l) => l.amount !== 0n);
  return { ...out, total: out.sales + out.service + out.topup + out.other, lines };
}

/** What went out on a day, by expense category, biggest first. */
export async function computeDayExpense(tx: Tx, businessId: string, date: string, branchIds?: string[]) {
  const rows = await tx.incomeExpense.groupBy({
    by: ["categoryName"],
    where: { businessId, deletedAt: null, type: "EXPENSE", status: "COMPLETED", date, currency: "MMK", ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    _sum: { amount: true },
  });
  const lines: DayLine[] = rows
    .map((row) => ({ label: row.categoryName ?? "Expense", amount: row._sum.amount ?? 0n }))
    .filter((l) => l.amount !== 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  return { total: lines.reduce((t, l) => t + l.amount, 0n), lines };
}

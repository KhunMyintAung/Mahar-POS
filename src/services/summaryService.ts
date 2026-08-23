import { Tx } from "@/lib/prisma";
import { dateRangeUtc } from "@/lib/dates";

// Computes the daily business summary used by both the dashboard and daily close.

export interface DaySummary {
  wallets: { totalMmk: bigint; totalThb: bigint; lowBalance: { id: string; name: string; currentBalance: bigint; minBalance: bigint }[] };
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
  let totalMmk = 0n, totalThb = 0n;
  const lowBalance = [];
  for (const w of wallets) {
    if (w.currency === "MMK") totalMmk += w.currentBalance;
    if (w.currency === "THB") totalThb += w.currentBalance;
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
    wallets: { totalMmk, totalThb, lowBalance },
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

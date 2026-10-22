import { prisma } from "@/lib/prisma";
import { businessDateOf, dateRangeUtc } from "@/lib/dates";
import { bucketForKey } from "@/lib/incomeCategories";

/** The business report for any period: a day, a month, a year or a range.
 *
 *  Everything is read once for the whole period and then grouped, by day for up to two
 *  months and by month beyond that, so a year's report is a handful of queries rather
 *  than one per day. All money is BigInt minor units.
 *
 *  Profit and cash are kept apart on purpose:
 *  - Profit: what the shop earned. Sales count at their margin over cost, top-up at its
 *    margin, service and other income in full; operating expenses, staff salary and repair
 *    parts come off. Shares (owner and partner drawings) are shown after net profit.
 *  - Cash flow: money that actually moved through the wallets, in and out, including
 *    buying stock, which is not an expense until the stock is sold. */

export const REPORT_SETTING = "report_settings";

export interface ReportSettings {
  /** Expense categories that are staff pay, shown as their own line. */
  salaryCategories: string[];
  /** Show owner and partner withdrawals as "Shares". */
  showShares: boolean;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = { salaryCategories: [], showShares: true };

export function parseReportSettings(raw: unknown): ReportSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ReportSettings>;
  return {
    salaryCategories: Array.isArray(v.salaryCategories) ? v.salaryCategories.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    showShares: v.showShares !== false,
  };
}

export async function loadReportSettings(businessId: string): Promise<ReportSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: REPORT_SETTING } } });
  try {
    return parseReportSettings(row ? JSON.parse(row.value) : undefined);
  } catch {
    return { ...DEFAULT_REPORT_SETTINGS };
  }
}

export interface PeriodRow {
  period: string;
  sales: bigint; salesCost: bigint; service: bigint; topup: bigint; topupMargin: bigint; otherIncome: bigint;
  expense: bigint; salary: bigint; repairParts: bigint; shares: bigint;
  cashIn: bigint; cashOut: bigint;
}

export interface Report {
  from: string; to: string; groupBy: "day" | "month";
  settings: ReportSettings;
  rows: (PeriodRow & { totalIncome: bigint; grossProfit: bigint; netProfit: bigint; netCash: bigint })[];
  totals: PeriodRow & { totalIncome: bigint; grossProfit: bigint; netProfit: bigint; netCash: bigint; saleCount: number };
  incomeByCategory: { name: string; amount: bigint }[];
  expenseByCategory: { name: string; amount: bigint; salary: boolean }[];
  salesByItem: { name: string; quantity: number; revenue: bigint; cost: bigint; profit: bigint }[];
  repairs: { received: number; finished: number; delivered: number; cancelled: number; collected: bigint };
  wallets: { name: string; currency: string; opening: bigint; moneyIn: bigint; moneyOut: bigint; closing: bigint }[];
  purchases: { count: number; total: bigint };
}

const zeroRow = (period: string): PeriodRow => ({
  period, sales: 0n, salesCost: 0n, service: 0n, topup: 0n, topupMargin: 0n, otherIncome: 0n,
  expense: 0n, salary: 0n, repairParts: 0n, shares: 0n, cashIn: 0n, cashOut: 0n,
});

/** Day keys from one date to another, or month keys. */
function periodKeys(from: string, to: string, groupBy: "day" | "month"): string[] {
  const keys: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const day = d.toISOString().slice(0, 10);
    const key = groupBy === "day" ? day : day.slice(0, 7);
    if (keys[keys.length - 1] !== key) keys.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

const ledgerMovesCash = (refType: string) => !["TRANSFER_IN", "TRANSFER_OUT", "EXCHANGE_IN", "EXCHANGE_OUT", "OPENING"].includes(refType);

export async function buildReport(businessId: string, from: string, to: string, branchIds?: string[]): Promise<Report> {
  const groupBy: "day" | "month" = periodKeys(from, to, "day").length > 62 ? "month" : "day";
  const keyOf = (date: string) => (groupBy === "day" ? date : date.slice(0, 7));
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };
  const branch = branchIds ? { branchId: { in: branchIds } } : {};
  const settings = await loadReportSettings(businessId);
  const salarySet = new Set(settings.salaryCategories.map((c) => c.toLowerCase()));

  const [sales, saleLines, ledger, billerSales, entries, keyedCats, repairUse, jobsIn, jobsDone, jobsDelivered, jobsCancelled, wallets, purchases] = await Promise.all([
    prisma.sale.findMany({ where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch }, select: { date: true, total: true, totalCost: true } }),
    prisma.saleLine.findMany({
      where: { sale: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch } },
      select: { quantity: true, lineTotal: true, unitCost: true, item: { select: { name: true } } },
    }),
    prisma.walletLedgerEntry.findMany({
      where: { businessId, createdAt: range, ...branch },
      select: { walletId: true, direction: true, amount: true, refType: true, createdAt: true },
    }),
    prisma.billerTxn.findMany({ where: { businessId, voidedAt: null, kind: "SALE", createdAt: range, ...branch }, select: { cashAmount: true, profit: true, createdAt: true } }),
    prisma.incomeExpense.findMany({
      where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, currency: "MMK", ...branch },
      select: { type: true, categoryName: true, amount: true, date: true },
    }),
    prisma.category.findMany({ where: { businessId, type: "INCOME", systemKey: { not: null } }, select: { name: true, systemKey: true } }),
    prisma.stockMovement.findMany({ where: { businessId, type: "REPAIR_USE", createdAt: range, ...branch }, select: { quantity: true, createdAt: true, item: { select: { costPrice: true } } } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, receivedAt: range } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, completedAt: range } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, deliveredAt: range } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, status: "CANCELLED", updatedAt: range } }),
    prisma.wallet.findMany({ where: { businessId, deletedAt: null, ...(branchIds ? { branchId: { in: branchIds } } : {}) }, select: { id: true, name: true, currency: true, currentBalance: true }, orderBy: { name: "asc" } }),
    prisma.purchase.aggregate({ where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch }, _sum: { total: true }, _count: true }),
  ]);

  const rows = new Map(periodKeys(from, to, groupBy).map((k) => [k, zeroRow(k)]));
  const at = (date: string) => rows.get(keyOf(date)) ?? rows.set(keyOf(date), zeroRow(keyOf(date))).get(keyOf(date))!;

  for (const s of sales) { const r = at(s.date); r.sales += s.total; r.salesCost += s.totalCost; }
  const mmkWallets = new Set(wallets.filter((w) => w.currency === "MMK").map((w) => w.id));
  for (const l of ledger) {
    const date = businessDateOf(l.createdAt);
    const r = at(date);
    if (l.refType === "REPAIR_DEPOSIT" || l.refType === "REPAIR_PAYMENT") {
      if (mmkWallets.has(l.walletId)) r.service += l.direction === "DEBIT" ? l.amount : -l.amount;
    }
    if (mmkWallets.has(l.walletId) && ledgerMovesCash(l.refType)) {
      if (l.direction === "DEBIT") r.cashIn += l.amount; else r.cashOut += l.amount;
    }
  }
  for (const b of billerSales) { const r = at(businessDateOf(b.createdAt)); r.topup += b.cashAmount; r.topupMargin += b.profit; }
  const keyByName = new Map(keyedCats.map((c) => [c.name.toLowerCase(), c.systemKey]));
  const incomeCats = new Map<string, bigint>();
  const expenseCats = new Map<string, bigint>();
  for (const e of entries) {
    const r = at(e.date);
    const name = e.categoryName ?? (e.type === "WITHDRAW" ? "Withdrawal" : "—");
    if (e.type === "INCOME") {
      const bucket = bucketForKey(keyByName.get(name.toLowerCase()));
      if (bucket === "sales") r.sales += e.amount;
      else if (bucket === "service") r.service += e.amount;
      else if (bucket === "topup") { r.topup += e.amount; r.topupMargin += e.amount; }
      else r.otherIncome += e.amount;
      incomeCats.set(name, (incomeCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "EXPENSE") {
      if (salarySet.has(name.toLowerCase())) r.salary += e.amount; else r.expense += e.amount;
      expenseCats.set(name, (expenseCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "WITHDRAW") {
      r.shares += e.amount;
    }
  }
  for (const m of repairUse) at(businessDateOf(m.createdAt)).repairParts += BigInt(-m.quantity) * m.item.costPrice;

  const finish = (r: PeriodRow) => {
    const totalIncome = r.sales + r.service + r.topup + r.otherIncome;
    // Top-up counts at its margin: the rest of that cash is the operator's credit passing through.
    const grossProfit = r.sales - r.salesCost + r.service + r.topupMargin + r.otherIncome - r.repairParts;
    const netProfit = grossProfit - r.expense - r.salary;
    return { ...r, totalIncome, grossProfit, netProfit, netCash: r.cashIn - r.cashOut };
  };
  const ordered = [...rows.values()].sort((a, b) => a.period.localeCompare(b.period)).map(finish);
  const sum = ordered.reduce((t, r) => {
    for (const k of Object.keys(t) as (keyof PeriodRow)[]) if (k !== "period") (t[k] as bigint) += r[k] as bigint;
    return t;
  }, zeroRow(`${from} – ${to}`));

  // Items sold, best sellers first.
  const byItem = new Map<string, { name: string; quantity: number; revenue: bigint; cost: bigint }>();
  for (const l of saleLines) {
    const cur = byItem.get(l.item.name) ?? { name: l.item.name, quantity: 0, revenue: 0n, cost: 0n };
    cur.quantity += l.quantity; cur.revenue += l.lineTotal; cur.cost += l.unitCost * BigInt(l.quantity);
    byItem.set(l.item.name, cur);
  }

  // Wallet balances: closing is today's balance less everything after the period; opening
  // is closing less the period's own movements.
  const after = await prisma.walletLedgerEntry.groupBy({
    by: ["walletId", "direction"],
    where: { businessId, createdAt: { gte: range.lt }, walletId: { in: wallets.map((w) => w.id) } },
    _sum: { amount: true },
  });
  const net = (list: { walletId: string; direction: string; amount: bigint }[], id: string) =>
    list.filter((x) => x.walletId === id).reduce((a, x) => a + (x.direction === "DEBIT" ? x.amount : -x.amount), 0n);
  const afterFlat = after.map((a) => ({ walletId: a.walletId, direction: a.direction, amount: a._sum.amount ?? 0n }));

  return {
    from, to, groupBy, settings,
    rows: ordered,
    totals: { ...finish(sum), saleCount: sales.length },
    incomeByCategory: [...incomeCats].map(([name, amount]) => ({ name, amount })).sort((a, b) => Number(b.amount - a.amount)),
    expenseByCategory: [...expenseCats].map(([name, amount]) => ({ name, amount, salary: salarySet.has(name.toLowerCase()) })).sort((a, b) => Number(b.amount - a.amount)),
    salesByItem: [...byItem.values()].map((i) => ({ ...i, profit: i.revenue - i.cost })).sort((a, b) => Number(b.revenue - a.revenue)),
    repairs: { received: jobsIn, finished: jobsDone, delivered: jobsDelivered, cancelled: jobsCancelled, collected: sum.service },
    wallets: wallets.map((w) => {
      const closing = w.currentBalance - net(afterFlat, w.id);
      const inRange = ledger.filter((l) => l.walletId === w.id);
      const moneyIn = inRange.filter((l) => l.direction === "DEBIT").reduce((a, l) => a + l.amount, 0n);
      const moneyOut = inRange.filter((l) => l.direction === "CREDIT").reduce((a, l) => a + l.amount, 0n);
      return { name: w.name, currency: w.currency, opening: closing - moneyIn + moneyOut, moneyIn, moneyOut, closing };
    }),
    purchases: { count: purchases._count, total: purchases._sum.total ?? 0n },
  };
}

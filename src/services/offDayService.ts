import { prisma } from "@/lib/prisma";
import { businessDateOf, dateRangeUtc, todayBusinessDate } from "@/lib/dates";
import { countDays, NO_OFF_DAYS, OFF_DAYS_KEY, parseOffDays, type DayCounts, type OffDays } from "@/lib/offDays";

export async function loadOffDays(businessId: string): Promise<OffDays> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: OFF_DAYS_KEY } }, select: { value: true } });
  if (!row) return NO_OFF_DAYS;
  try { return parseOffDays(JSON.parse(row.value)); } catch { return NO_OFF_DAYS; }
}

/** The days something was recorded on: a sale, an income or expense entry, a top-up or bill
 *  trade, a wallet movement, or a repair job taken in or handed back. */
export async function activeDates(businessId: string, from: string, to: string, branchIds?: string[]): Promise<Set<string>> {
  const branch = branchIds ? { branchId: { in: branchIds } } : {};
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };
  const dates = { gte: from, lte: to };
  const [sales, entries, purchases, billers, ledger, jobsIn, jobsOut] = await Promise.all([
    prisma.sale.groupBy({ by: ["date"], where: { businessId, deletedAt: null, date: dates, ...branch } }),
    prisma.incomeExpense.groupBy({ by: ["date"], where: { businessId, deletedAt: null, date: dates, ...branch } }),
    prisma.purchase.groupBy({ by: ["date"], where: { businessId, deletedAt: null, date: dates, ...branch } }),
    prisma.billerTxn.findMany({ where: { businessId, createdAt: range, ...branch }, select: { createdAt: true } }),
    prisma.walletLedgerEntry.findMany({ where: { businessId, createdAt: range, ...branch }, select: { createdAt: true } }),
    prisma.repairJob.findMany({ where: { businessId, deletedAt: null, receivedAt: range, ...branch }, select: { receivedAt: true } }),
    prisma.repairJob.findMany({ where: { businessId, deletedAt: null, deliveredAt: range, ...branch }, select: { deliveredAt: true } }),
  ]);
  const out = new Set<string>([...sales, ...entries, ...purchases].map((g) => g.date));
  for (const d of [...billers.map((b) => b.createdAt), ...ledger.map((l) => l.createdAt), ...jobsIn.map((j) => j.receivedAt), ...jobsOut.map((j) => j.deliveredAt)]) {
    if (d) out.add(businessDateOf(d));
  }
  return out;
}

export interface OffDayReport {
  /** The weekly off days and the dates marked off. */
  config: OffDays;
  /** The report's own period, up to today. */
  period: DayCounts;
  /** The whole year of the period's end, up to today. */
  year: DayCounts & { year: string };
}

/** Open days, off days and days with nothing recorded, for a period and for its year. */
export async function offDayReport(businessId: string, from: string, to: string, branchIds?: string[]): Promise<OffDayReport> {
  const today = todayBusinessDate();
  const year = to.slice(0, 4);
  const yearFrom = `${year}-01-01`;
  const yearTo = `${year}-12-31`;
  const first = from < yearFrom ? from : yearFrom;
  const last = to > yearTo ? to : yearTo;
  const [config, active, business] = await Promise.all([
    loadOffDays(businessId),
    activeDates(businessId, first, last < today ? last : today, branchIds),
    prisma.business.findUnique({ where: { id: businessId }, select: { createdAt: true } }),
  ]);
  // Days before the shop started are not its off days: count from its first day (the day it
  // joined, or an earlier record brought in from its books).
  const joined = business ? businessDateOf(business.createdAt) : first;
  const earliest = [...active].sort()[0];
  const start = earliest && earliest < joined ? earliest : joined;
  const from_ = (d: string) => (d < start ? start : d);
  return {
    config,
    period: countDays(from_(from), to, today, active, config),
    year: { year, ...countDays(from_(yearFrom), yearTo, today, active, config) },
  };
}

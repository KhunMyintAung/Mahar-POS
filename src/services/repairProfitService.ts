import { prisma } from "@/lib/prisma";
import { businessDateOf, dateRangeUtc } from "@/lib/dates";
import { DEFAULT_REPAIR_FLOW, parseRepairFlow, REPAIR_FLOW_KEY, type RepairFlow } from "@/lib/repairFlow";

export async function loadRepairFlow(businessId: string): Promise<RepairFlow> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: REPAIR_FLOW_KEY } }, select: { value: true } });
  if (!row) return DEFAULT_REPAIR_FLOW;
  try { return parseRepairFlow(JSON.parse(row.value)); } catch { return DEFAULT_REPAIR_FLOW; }
}

/** Today's totals of repairs paid: how many, their charge, parts cost and profit. */
export async function paidTotals(businessId: string, date: string, branchIds?: string[]) {
  const jobs = await jobsPaidBetween(businessId, date, date, branchIds);
  return jobs.reduce(
    (t, j) => ({ count: t.count + 1, charge: t.charge + j.finalCost, parts: t.parts + j.partsCost, profit: t.profit + j.profit }),
    { count: 0, charge: 0n, parts: 0n, profit: 0n },
  );
}

/** Repair jobs settled in a date range: the day of each job's last payment (Mark as paid)
 *  falls in it. A job is counted once, on that day, however many payments it had. */
export async function jobsPaidBetween(businessId: string, from: string, to: string, branchIds?: string[]) {
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };
  const last = await prisma.walletLedgerEntry.groupBy({
    by: ["refId"],
    // Only payments from the range's start on: a job's last payment, if in the range, is among them.
    where: { businessId, refType: "REPAIR_PAYMENT", direction: "DEBIT", refId: { not: null }, createdAt: { gte: range.gte } },
    _max: { createdAt: true },
    having: { createdAt: { _max: { gte: range.gte, lt: range.lt } } },
  });
  if (last.length === 0) return [];
  const paidAt = new Map(last.map((l) => [l.refId!, l._max.createdAt!]));
  const jobs = await prisma.repairJob.findMany({
    where: { businessId, id: { in: [...paidAt.keys()] }, deletedAt: null, status: { not: "CANCELLED" }, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: {
      id: true, jobNo: true, customerName: true, deviceBrand: true, deviceModel: true, technicianName: true,
      finalCost: true, partsCost: true, branchId: true,
    },
  });
  return jobs
    .map((j) => ({ ...j, paidDate: businessDateOf(paidAt.get(j.id)!), profit: j.finalCost - j.partsCost }))
    .sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.jobNo.localeCompare(b.jobNo));
}

/** A day's service money entered in Income & Expense: income under Daily Service Income and
 *  expense under Daily Service Expense (parts bought for repairs, and other repair costs). */
export async function serviceEntriesOn(businessId: string, date: string, branchIds?: string[]) {
  const cats = await prisma.category.findMany({ where: { businessId, systemKey: "DAILY_SERVICE" }, select: { name: true, type: true } });
  const names = (type: string) => cats.filter((c) => c.type === type).map((c) => c.name);
  const where = { businessId, deletedAt: null, status: "COMPLETED" as const, date, currency: "MMK", ...(branchIds ? { branchId: { in: branchIds } } : {}) };
  const [income, expense] = await Promise.all([
    prisma.incomeExpense.aggregate({ where: { ...where, type: "INCOME", billerTxnId: null, categoryName: { in: names("INCOME") } }, _sum: { amount: true } }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "EXPENSE", categoryName: { in: names("EXPENSE") } }, _sum: { amount: true } }),
  ]);
  return { income: income._sum.amount ?? 0n, expense: expense._sum.amount ?? 0n };
}

import { prisma } from "@/lib/prisma";
import { businessDateOf, dateRangeUtc } from "@/lib/dates";
import { DEFAULT_REPAIR_FLOW, parseRepairFlow, REPAIR_FLOW_KEY, type RepairFlow } from "@/lib/repairFlow";

export async function loadRepairFlow(businessId: string): Promise<RepairFlow> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: REPAIR_FLOW_KEY } }, select: { value: true } });
  if (!row) return DEFAULT_REPAIR_FLOW;
  try { return parseRepairFlow(JSON.parse(row.value)); } catch { return DEFAULT_REPAIR_FLOW; }
}

/** Repair jobs settled in a date range: the day of each job's last payment (Mark as paid)
 *  falls in it. A job is counted once, on that day, however many payments it had. */
export async function jobsPaidBetween(businessId: string, from: string, to: string, branchIds?: string[]) {
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };
  const last = await prisma.walletLedgerEntry.groupBy({
    by: ["refId"],
    where: { businessId, refType: "REPAIR_PAYMENT", direction: "DEBIT", refId: { not: null } },
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

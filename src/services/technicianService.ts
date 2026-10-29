import { prisma } from "@/lib/prisma";
import { percentOf } from "@/lib/money";
import { monthRangeUtc } from "@/lib/dates";
import { BENCH_STATUSES } from "@/lib/repairStatus";

const REPAIRED = ["DONE", "DELIVERED"];

export const COMMISSION_MODES = ["NONE", "PERCENT", "AMOUNT"] as const;
export type CommissionMode = (typeof COMMISSION_MODES)[number];

export interface CommissionRule { mode: string; percent: string; amount: bigint }

/** What a technician earns on one finished repair: a percent of what it made (the charge
 *  less its parts, never below nothing), or a fixed sum per repair. */
export function repairCommission(job: { finalCost: bigint; partsCost: bigint }, rule: CommissionRule): bigint {
  if (rule.mode === "AMOUNT") return rule.amount;
  if (rule.mode === "PERCENT") {
    const made = job.finalCost - job.partsCost;
    return made > 0n ? percentOf(made, rule.percent || "0") : 0n;
  }
  return 0n;
}

export interface TechnicianRow {
  name: string;
  /** The Service Tech user of that name, who can be paid a commission. */
  userId: string | null;
  takenIn: number; repaired: number; cannotRepair: number; working: number;
  charged: bigint; parts: bigint; profit: bigint; commission: bigint;
  avgDays: number | null;
  rule: { mode: string; percent: string; amount: bigint } | null;
}

/** How each technician did in a month (YYYY-MM): repairs taken in, repaired, could not
 *  repair and still in work now; what the repaired ones charged, the parts they used, what is
 *  left, what the technician earned on them, and the days a repair took on average.
 *  Counted by the name on the job, so a technician with no login counts too; only a Service
 *  Tech user earns a commission. Repaired means finished (Done or Delivered) in the month. */
export async function technicianPerformance(businessId: string, month: string) {
  const range = monthRangeUtc(month);
  const [jobs, techs] = await Promise.all([
    prisma.repairJob.findMany({
      where: {
        businessId, deletedAt: null,
        OR: [{ receivedAt: range }, { completedAt: range }, { status: { in: BENCH_STATUSES } }],
      },
      select: { technicianName: true, status: true, receivedAt: true, completedAt: true, finalCost: true, partsCost: true },
    }),
    // Only users with the Service Tech role can be picked as a repair's technician.
    prisma.user.findMany({
      where: { businessId, deletedAt: null, active: true, role: { name: "Service Tech" } },
      select: { id: true, name: true, repairCommissionMode: true, repairCommissionPercent: true, repairCommissionAmount: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const techByName = new Map(techs.map((t) => [t.name.trim(), t]));
  const inMonth = (d: Date | null) => Boolean(d && d >= range.gte && d < range.lt);
  const rows = new Map<string, TechnicianRow & { days: number }>();
  const rowOf = (name: string | null) => {
    const key = name?.trim() || "";
    let r = rows.get(key);
    if (!r) {
      const t = key ? techByName.get(key) : undefined;
      rows.set(key, (r = {
        name: key, userId: t?.id ?? null,
        takenIn: 0, repaired: 0, cannotRepair: 0, working: 0,
        charged: 0n, parts: 0n, profit: 0n, commission: 0n, avgDays: null, days: 0,
        rule: t ? { mode: t.repairCommissionMode, percent: t.repairCommissionPercent, amount: t.repairCommissionAmount } : null,
      }));
    }
    return r;
  };
  // Every Service Tech has a row, so one with no repairs yet can still be given a commission.
  for (const t of techs) rowOf(t.name);

  for (const j of jobs) {
    const r = rowOf(j.technicianName);
    if (inMonth(j.receivedAt)) r.takenIn++;
    if ((BENCH_STATUSES as string[]).includes(j.status)) r.working++;
    if (inMonth(j.completedAt) && REPAIRED.includes(j.status)) {
      r.repaired++;
      r.charged += j.finalCost;
      r.parts += j.partsCost;
      r.days += (j.completedAt!.getTime() - j.receivedAt.getTime()) / 86_400_000;
      if (r.rule) r.commission += repairCommission(j, r.rule);
    }
    if (inMonth(j.completedAt) && j.status === "CANNOT_REPAIR") r.cannotRepair++;
  }

  const technicians: TechnicianRow[] = [...rows.values()]
    .map(({ days, ...r }) => ({
      ...r,
      profit: r.charged - r.parts,
      avgDays: r.repaired ? Math.round((days / r.repaired) * 10) / 10 : null,
    }))
    // The busiest first; jobs with no technician last.
    .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.repaired - a.repaired || b.takenIn - a.takenIn || a.name.localeCompare(b.name));

  return { technicians, serviceTechs: techs.map((t) => ({ id: t.id, name: t.name })) };
}

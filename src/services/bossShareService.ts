import { prisma } from "@/lib/prisma";
import { todayBusinessDate } from "@/lib/dates";
import { buildReport, distribute } from "@/services/reportService";

/** One month's Boss Share as Reports work it out: net profit, capital kept, each partner's
 *  share, and what the partners leave (the staff bonus pool). */
export async function monthShare(businessId: string, month: string) {
  // Worked out from the year so far, as the Boss Share table is, so what is taken matches
  // what was shown (Reports count some costs by the whole period asked for).
  const today = todayBusinessDate();
  const year = month.slice(0, 4);
  const yearEnd = `${year}-12-31`;
  const report = await buildReport(businessId, `${year}-01-01`, yearEnd < today ? yearEnd : today);
  const netProfit = report.rows.filter((r) => r.period.startsWith(month)).reduce((n, r) => n + r.netProfit, 0n);
  const d = distribute(netProfit, report.settings, 1);
  return { month, netProfit, reserve: d.reserve, left: d.left, partners: d.partners };
}

/** Whether a month is over (a share is taken only for a finished month). */
export const monthDone = (month: string) => month < todayBusinessDate().slice(0, 7);

/** Each month's take and the profit bonus given from it, for a year. */
export async function yearTakes(businessId: string, year: string) {
  const [takes, bonuses] = await Promise.all([
    prisma.bossShareTake.findMany({ where: { businessId, month: { startsWith: year }, voidedAt: null } }),
    prisma.staffBonus.findMany({ where: { businessId, held: true, voidedAt: null, month: { startsWith: year } }, select: { month: true, amount: true } }),
  ]);
  const given = new Map<string, bigint>();
  for (const b of bonuses) if (b.month) given.set(b.month, (given.get(b.month) ?? 0n) + b.amount);
  return { takes: new Map(takes.map((t) => [t.month, t])), given };
}

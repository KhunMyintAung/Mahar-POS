import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidMonth, monthRangeUtc, todayBusinessDate } from "@/lib/dates";

const WORKING = ["RECEIVED", "CHECKING", "IN_PROGRESS", "WAITING_PARTS"];
const REPAIRED = ["DONE", "DELIVERED"];

/** How each technician did in a month (?month=YYYY-MM, this month by default): repairs taken
 *  in, repaired, could not repair, and still in work now; what the repaired ones charged, the
 *  parts they used and what is left; and the days a repair took on average. Counted by the
 *  name on the job, so a technician with no login counts too. Also the names to suggest. */
export const GET = withAuth("repair.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const month = isValidMonth(sp.get("month") ?? "") ? sp.get("month")! : todayBusinessDate().slice(0, 7);
  const range = monthRangeUtc(month);
  const businessId = user.businessId;

  const [jobs, users, named] = await Promise.all([
    prisma.repairJob.findMany({
      where: {
        businessId, deletedAt: null,
        OR: [{ receivedAt: range }, { completedAt: range }, { status: { in: WORKING } }],
      },
      select: { technicianName: true, status: true, receivedAt: true, completedAt: true, finalCost: true, partsCost: true },
    }),
    prisma.user.findMany({ where: { businessId, deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.repairJob.groupBy({ by: ["technicianName"], where: { businessId, deletedAt: null, technicianName: { not: null } } }),
  ]);

  const inMonth = (d: Date | null) => Boolean(d && d >= range.gte && d < range.lt);
  const rows = new Map<string, {
    name: string; takenIn: number; repaired: number; cannotRepair: number; working: number;
    charged: bigint; parts: bigint; days: number;
  }>();
  const rowOf = (name: string | null) => {
    const key = name?.trim() || "";
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { name: key, takenIn: 0, repaired: 0, cannotRepair: 0, working: 0, charged: 0n, parts: 0n, days: 0 }));
    return r;
  };
  for (const j of jobs) {
    const r = rowOf(j.technicianName);
    if (inMonth(j.receivedAt)) r.takenIn++;
    if (WORKING.includes(j.status)) r.working++;
    if (inMonth(j.completedAt) && REPAIRED.includes(j.status)) {
      r.repaired++;
      r.charged += j.finalCost;
      r.parts += j.partsCost;
      r.days += (j.completedAt!.getTime() - j.receivedAt.getTime()) / 86_400_000;
    }
    if (inMonth(j.completedAt) && j.status === "CANNOT_REPAIR") r.cannotRepair++;
  }

  const technicians = [...rows.values()]
    .map((r) => ({
      name: r.name,
      takenIn: r.takenIn, repaired: r.repaired, cannotRepair: r.cannotRepair, working: r.working,
      charged: r.charged, parts: r.parts, profit: r.charged - r.parts,
      avgDays: r.repaired ? Math.round((r.days / r.repaired) * 10) / 10 : null,
    }))
    // The busiest first; jobs with no technician last.
    .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.repaired - a.repaired || b.takenIn - a.takenIn || a.name.localeCompare(b.name));

  const suggestions = [...new Set([...named.map((n) => n.technicianName!.trim()), ...users.map((u) => u.name)])].filter(Boolean).sort();
  return json({ month, technicians, suggestions });
});

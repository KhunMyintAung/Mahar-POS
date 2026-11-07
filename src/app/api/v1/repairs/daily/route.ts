import { withAuth, json, ApiError } from "@/lib/api";
import { isValidBusinessDate, todayBusinessDate } from "@/lib/dates";
import { canSeeCost } from "@/lib/permissions";
import { jobsPaidBetween, loadRepairFlow, serviceEntriesOn } from "@/services/repairProfitService";

/** Repairs paid on a day (?date=YYYY-MM-DD, today by default): each job's charge, parts cost
 *  and profit, the day's totals and each technician's. Costs are for whoever may see them. */
export const GET = withAuth("repair.view", async ({ req, user }) => {
  if (!canSeeCost(user.permissions)) throw new ApiError(403, "Not allowed to see costs");
  const date = req.nextUrl.searchParams.get("date") || todayBusinessDate();
  if (!isValidBusinessDate(date)) throw new ApiError(422, "Invalid date");
  const [flow, jobs, entries] = await Promise.all([loadRepairFlow(user.businessId), jobsPaidBetween(user.businessId, date, date), serviceEntriesOn(user.businessId, date)]);
  const sum = (list: typeof jobs) => list.reduce((t, j) => ({ count: t.count + 1, charge: t.charge + j.finalCost, parts: t.parts + j.partsCost, profit: t.profit + j.profit }), { count: 0, charge: 0n, parts: 0n, profit: 0n });
  const names = [...new Set(jobs.map((j) => j.technicianName?.trim() || ""))];
  return json({
    date, parts: flow.parts,
    jobs: jobs.map((j) => ({ id: j.id, jobNo: j.jobNo, who: j.customerName || `${j.deviceBrand} ${j.deviceModel}`.trim(), device: `${j.deviceBrand} ${j.deviceModel}`.trim(), technician: j.technicianName, charge: j.finalCost, partsCost: j.partsCost, profit: j.profit })),
    byTechnician: names.map((n) => ({ technician: n || null, ...sum(jobs.filter((j) => (j.technicianName?.trim() || "") === n)) })).sort((a, b) => Number(b.profit - a.profit)),
    total: sum(jobs),
    // The day's repair profit, as the report and the Dashboard work it out: repair charges and
    // service income, less that day's repair expenses and, when parts are bought per job, the
    // parts cost of each job paid (parts from stock were counted as expense when bought).
    day: (() => {
      const t = sum(jobs);
      const parts = flow.parts === "job" ? t.parts : 0n;
      const income = t.charge + entries.income;
      return { charge: t.charge, otherIncome: entries.income, income, parts, expense: entries.expense, profit: income - parts - entries.expense };
    })(),
  });
});

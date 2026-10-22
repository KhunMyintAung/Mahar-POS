import { withAuth, json } from "@/lib/api";
import { resolvePeriod } from "@/lib/reportSheets";
import { buildReport } from "@/services/reportService";

/** The business report for a day, month, year or range (see reportService). */
export const GET = withAuth("report.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const p = resolvePeriod(sp.get("period"), sp.get("date"), sp.get("from"), sp.get("to"));
  const branchId = sp.get("branchId");
  const branchIds = branchId ? [branchId] : user.allBranches ? undefined : user.branchIds;
  const report = await buildReport(user.businessId, p.from, p.to, branchIds);
  return json({ ...report, period: p });
});

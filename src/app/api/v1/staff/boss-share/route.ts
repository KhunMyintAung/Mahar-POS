import { withAuth, json, ApiError } from "@/lib/api";
import { todayBusinessDate } from "@/lib/dates";
import { buildReport, distribute } from "@/services/reportService";

/** Boss Share for ?year=YYYY: each month's net profit (as Reports work it out), less the
 *  capital kept, split among the partners set in Reports, month by month. It shows the
 *  shop's profit, so it needs Reports access as well as Staff (the owner, not HR). */
export const GET = withAuth("staff.manage", async ({ req, user }) => {
  if (!user.permissions.includes("report.view")) throw new ApiError(403, "Reports access needed");
  const year = req.nextUrl.searchParams.get("year") || todayBusinessDate().slice(0, 4);
  if (!/^\d{4}$/.test(year)) throw new ApiError(422, "Invalid year");
  const today = todayBusinessDate();
  const to = year === today.slice(0, 4) ? today : `${year}-12-31`;
  if (`${year}-01-01` > today) return json({ year, partners: [], months: [] });
  const report = await buildReport(user.businessId, `${year}-01-01`, to);
  // Early in the year the report comes by day: added up into months first.
  const byMonth = new Map<string, bigint>();
  for (const r of report.rows) byMonth.set(r.period.slice(0, 7), (byMonth.get(r.period.slice(0, 7)) ?? 0n) + r.netProfit);
  const months = [...byMonth].map(([month, netProfit]) => {
    const d = distribute(netProfit, report.settings, 1);
    return { month, netProfit, reserve: d.reserve, shares: d.partners.map((p) => p.amount) };
  });
  const partners = report.settings.partners.map((p, i) => ({
    name: p.name,
    percent: report.distribution.partners[i]?.percent ?? p.percent,
    total: months.reduce((n, m) => n + (m.shares[i] ?? 0n), 0n),
  }));
  return json({ year, partners, months });
});

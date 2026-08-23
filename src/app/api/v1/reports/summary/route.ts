import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computeDaySummary } from "@/services/summaryService";
import { todayBusinessDate, addDays, isValidBusinessDate } from "@/lib/dates";

export const GET = withAuth("report.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const to = sp.get("to") ?? todayBusinessDate();
  const from = sp.get("from") ?? addDays(to, -6);
  if (!isValidBusinessDate(from) || !isValidBusinessDate(to) || from > to)
    throw new ApiError(422, "Invalid date range");

  const days: string[] = [];
  for (let d = from; d <= to && days.length < 92; d = addDays(d, 1)) days.push(d);
  if (days.length >= 92) throw new ApiError(422, "Date range is limited to 92 days");

  const branchId = sp.get("branchId");
  const branchIds = branchId ? [branchId] : user.allBranches ? undefined : user.branchIds;
  const daily = [];
  for (const date of days) {
    const s = await computeDaySummary(prisma, user.businessId, date, branchIds);
    daily.push({
      date,
      income: s.general.otherIncome,
      expense: s.general.expense,
      creditCollected: s.credit.collected,
      payablePaid: s.payable.paid,
      netCashMovement: s.general.netCashMovement,
    });
  }

  const totals = daily.reduce(
    (a, d) => ({
      income: a.income + d.income,
      expense: a.expense + d.expense,
      netCashMovement: a.netCashMovement + d.netCashMovement,
    }),
    { income: 0n, expense: 0n, netCashMovement: 0n }
  );

  return json({ from, to, daily, totals });
});

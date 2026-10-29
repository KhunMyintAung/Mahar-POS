import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { buildCsv } from "@/lib/csv";
import { reportSheets, resolvePeriod } from "@/lib/reportSheets";
import { buildReport } from "@/services/reportService";

/** The report as one CSV file: the same tables as the Excel workbook, one after another. */
export const GET = withAuth("report.export", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const p = resolvePeriod(sp.get("period"), sp.get("date"), sp.get("from"), sp.get("to"));
  const branchId = sp.get("branchId");
  const branchIds = branchId ? [branchId] : user.allBranches ? undefined : user.branchIds;
  const report = await buildReport(user.businessId, p.from, p.to, branchIds);
  return new NextResponse(buildCsv(reportSheets(report)), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="report-${p.label.replace(/[^0-9A-Za-z-]+/g, "_")}.csv"`,
    },
  });
});

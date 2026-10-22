import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildXlsx } from "@/lib/xlsx";
import { reportSheets, resolvePeriod } from "@/lib/reportSheets";
import { buildReport } from "@/services/reportService";

/** The report as an Excel workbook: Grand Report, daily (or monthly) summary and stock. */
export const GET = withAuth("report.export", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const p = resolvePeriod(sp.get("period"), sp.get("date"), sp.get("from"), sp.get("to"));
  const branchId = sp.get("branchId");
  const branchIds = branchId ? [branchId] : user.allBranches ? undefined : user.branchIds;
  const [business, report] = await Promise.all([
    prisma.business.findUnique({ where: { id: user.businessId }, select: { name: true } }),
    buildReport(user.businessId, p.from, p.to, branchIds),
  ]);
  const title = `${business?.name ?? "Business"} · ${p.kind === "year" ? "Year" : p.kind === "month" ? "Month" : p.kind === "day" ? "Day" : "Report"} ${p.label}`;
  const file = buildXlsx(reportSheets(report, title));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="report-${p.label.replace(/[^0-9A-Za-z-]+/g, "_")}.xlsx"`,
    },
  });
});

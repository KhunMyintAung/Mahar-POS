import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { minorToDecimalString } from "@/lib/money";
import { dateRangeUtc, todayBusinessDate, addDays } from "@/lib/dates";

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

function csvResponse(filename: string, rows: (string | number)[][]) {
  // BOM so Excel opens UTF-8 (Myanmar text) correctly
  return new NextResponse("﻿" + csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withAuth("report.export", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "ledger";
  const to = sp.get("to") ?? todayBusinessDate();
  const from = sp.get("from") ?? addDays(to, -30);
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };

  if (type === "ledger") {
    const walletId = sp.get("walletId");
    if (!walletId) throw new ApiError(422, "walletId is required for ledger export");
    const entries = await prisma.walletLedgerEntry.findMany({
      where: { walletId, businessId: user.businessId, createdAt: range },
      orderBy: { createdAt: "asc" },
    });
    return csvResponse(`ledger-${from}-to-${to}.csv`, [
      ["Date", "Direction", "Amount", "Balance After", "Type", "Description"],
      ...entries.map((e) => [
        e.createdAt.toISOString().slice(0, 16).replace("T", " "),
        e.direction, minorToDecimalString(e.amount), minorToDecimalString(e.balanceAfter),
        e.refType, e.description ?? "",
      ]),
    ]);
  }

  throw new ApiError(422, `Unknown export type: ${type}`);
});

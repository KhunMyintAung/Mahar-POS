import { describe, expect, it } from "vitest";
import { inflateRawSync } from "zlib";
import { DEFAULT_REPORT_SETTINGS, distribute, incomeExpenseOf, type PeriodRow } from "../src/services/reportService";
import { buildXlsx } from "../src/lib/xlsx";

const row = (over: Partial<PeriodRow>): PeriodRow => ({
  period: "2026-10", sales: 0n, salesCost: 0n, service: 0n, topup: 0n, topupMargin: 0n, otherIncome: 0n,
  expense: 0n, salary: 0n, shares: 0n, cashIn: 0n, cashOut: 0n, expSales: 0n, expService: 0n, expTopup: 0n, expGeneral: 0n,
  ...over,
});

describe("report maths", () => {
  it("income − expense is the profit, sections included", () => {
    const r = incomeExpenseOf(row({
      sales: 3_465_000_00n, salesCost: 3_088_500_00n, service: 15_000_00n, topup: 1_000_000_00n, topupMargin: 30_000_00n,
      otherIncome: 5_000_00n, expService: 2_000_00n, expGeneral: 1_000_00n,
    }));
    expect(r.inc.total).toBe(4_485_000_00n);
    // Top-up expense is the operator's share of the cash: 1,000,000 − 30,000.
    expect(r.exp.topup).toBe(970_000_00n);
    expect(r.net).toBe(3_465_000_00n - 3_088_500_00n + 15_000_00n - 2_000_00n + 30_000_00n + 5_000_00n - 1_000_00n);
  });

  it("keeps a percent for next month and splits the rest equally", () => {
    const d = distribute(246_500_00n, { ...DEFAULT_REPORT_SETTINGS, reserve: { mode: "percent", value: 10 }, partners: [{ name: "A", percent: 0 }, { name: "B", percent: 0 }, { name: "C", percent: 0 }] }, 1);
    expect(d.reserve).toBe(24_650_00n);
    expect(d.distributable).toBe(221_850_00n);
    expect(d.partners.map((p) => p.amount)).toEqual([73_950_00n, 73_950_00n, 73_950_00n]);
  });

  it("gives the rounding kyats to the first partner and never splits a loss", () => {
    const d = distribute(100_00n, { ...DEFAULT_REPORT_SETTINGS, partners: [{ name: "A", percent: 0 }, { name: "B", percent: 0 }, { name: "C", percent: 0 }] }, 1);
    expect(d.partners.map((p) => p.amount)).toEqual([34_00n, 33_00n, 33_00n]);
    const loss = distribute(-5_000_00n, { ...DEFAULT_REPORT_SETTINGS, partners: [{ name: "A", percent: 100 }] }, 1);
    expect(loss.distributable).toBe(0n);
    expect(loss.partners[0].amount).toBe(0n);
  });

  it("takes a monthly amount for each month of the period, up to the profit", () => {
    const d = distribute(1_000_000_00n, { ...DEFAULT_REPORT_SETTINGS, reserve: { mode: "amount", value: 200_000 } }, 3);
    expect(d.reserve).toBe(600_000_00n);
    const small = distribute(100_000_00n, { ...DEFAULT_REPORT_SETTINGS, reserve: { mode: "amount", value: 200_000 } }, 1);
    expect(small.reserve).toBe(100_000_00n);
  });
});

describe("xlsx writer", () => {
  it("writes a zip with one worksheet per sheet and escaped text", () => {
    const file = buildXlsx([{ name: "Summary", rows: [["အရောင်း & <Sales>", 3465000]] }, { name: "Stock", rows: [["Item", "Qty"]] }]);
    expect(file.subarray(0, 2).toString()).toBe("PK");
    // Read the first sheet's entry back out of the zip.
    const names: string[] = [];
    let at = 0;
    let sheet1 = "";
    while (file.readUInt32LE(at) === 0x04034b50) {
      const size = file.readUInt32LE(at + 18);
      const nameLen = file.readUInt16LE(at + 26);
      const name = file.subarray(at + 30, at + 30 + nameLen).toString();
      names.push(name);
      const data = file.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
      if (name === "xl/worksheets/sheet1.xml") sheet1 = inflateRawSync(data).toString();
      at += 30 + nameLen + size;
    }
    expect(names).toContain("xl/worksheets/sheet2.xml");
    expect(sheet1).toContain("အရောင်း &amp; &lt;Sales&gt;");
    expect(sheet1).toContain("<v>3465000</v>");
  });
});

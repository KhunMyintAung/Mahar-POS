import { describe, expect, it } from "vitest";
import { inflateRawSync } from "zlib";
import { addBillerTxn, addRow, cashTypeOf, countCosts, DEFAULT_REPORT_SETTINGS, distribute, incomeExpenseOf, ledgerMovesCash, sectionsOf, type PeriodRow } from "../src/services/reportService";
import { buildXlsx } from "../src/lib/xlsx";

const row = (over: Partial<PeriodRow>): PeriodRow => ({
  period: "2026-10", sales: 0n, salesCost: 0n, service: 0n, topup: 0n, topupMargin: 0n, billProfit: 0n, otherIncome: 0n,
  expense: 0n, salary: 0n, shares: 0n, cashIn: 0n, cashOut: 0n, expSales: 0n, expService: 0n, expTopup: 0n, expGeneral: 0n, floatBought: 0n, stockBought: 0n,
  costOfSales: 0n, topupCost: 0n,
  ...over,
});
/** A row with its costs counted as a shop recording neither purchases nor float as expense (or as told). */
const counted = (r: PeriodRow, purchaseMode = false, floatMode = false) => { countCosts(r, purchaseMode, floatMode); return r; };

describe("report maths", () => {
  it("income − expense is the profit, sections included", () => {
    const r = incomeExpenseOf(counted(row({
      sales: 3_465_000_00n, salesCost: 3_088_500_00n, service: 15_000_00n, topup: 1_000_000_00n, topupMargin: 30_000_00n,
      otherIncome: 5_000_00n, expService: 2_000_00n, expGeneral: 1_000_00n,
    })));
    expect(r.inc.total).toBe(4_485_000_00n);
    // Top-up expense is the operator's share of the cash: 1,000,000 − 30,000.
    expect(r.exp.topup).toBe(970_000_00n);
    expect(r.net).toBe(3_465_000_00n - 3_088_500_00n + 15_000_00n - 2_000_00n + 30_000_00n + 5_000_00n - 1_000_00n);
  });

  it("uses the float bought as top-up cost when float purchases are recorded, never both", () => {
    const r = () => row({ topup: 500_000_00n, topupMargin: 16_000_00n, floatBought: 484_000_00n, expTopup: 1_000_00n });
    expect(incomeExpenseOf(counted(r(), false, false)).exp.topup).toBe(485_000_00n);
    expect(incomeExpenseOf(counted(r(), false, true)).exp.topup).toBe(485_000_00n);
    const more = () => row({ topup: 200_000_00n, topupMargin: 6_000_00n, floatBought: 500_000_00n });
    expect(incomeExpenseOf(counted(more(), false, false)).exp.topup).toBe(194_000_00n);
    expect(incomeExpenseOf(counted(more(), false, true)).exp.topup).toBe(500_000_00n);
  });

  it("uses the stock bought as sales cost when purchases are recorded", () => {
    const r = () => row({ sales: 1_000_000_00n, salesCost: 800_000_00n, stockBought: 1_500_000_00n, expSales: 5_000_00n });
    expect(incomeExpenseOf(counted(r())).exp.sales).toBe(805_000_00n);
    expect(incomeExpenseOf(counted(r(), true)).exp.sales).toBe(1_505_000_00n);
    expect(incomeExpenseOf(counted(r(), true)).net).toBe(-505_000_00n);
  });

  it("counts the discount on float bought as bill margin when credit sells at face value", () => {
    const r = row({});
    addBillerTxn(r, { kind: "TOPUP", cashAmount: 194_000_00n, profit: 6_000_00n });
    addBillerTxn(r, { kind: "SALE", cashAmount: 100_000_00n, profit: 0n });
    addBillerTxn(r, { kind: "SALE", cashAmount: 50_000_00n, profit: 1_000_00n });
    // Only sales bring top-up cash in; the refill's discount is margin. A sale's own profit
    // is Other income (Bill Profit), so Top-up shows the operator's part.
    expect(r.topup).toBe(149_000_00n);
    expect(r.topupMargin).toBe(6_000_00n);
    expect(r.otherIncome).toBe(1_000_00n);
    expect(sectionsOf(counted(r)).find((s) => s.section === "topup")!.profit).toBe(6_000_00n);
    expect(incomeExpenseOf(counted(r)).net).toBe(7_000_00n);
  });

  it("counts a sale's profit once when it was filed as Bill Profit income", () => {
    const r = row({});
    // Balance fell by 4,635, the customer paid 5,000: 365 profit, filed in Other income.
    addBillerTxn(r, { kind: "SALE", cashAmount: 5_000_00n, profit: 365_00n }, true);
    r.otherIncome += 365_00n;
    expect(r.topup).toBe(4_635_00n); // the operator's part; the profit is Other income
    expect(incomeExpenseOf(counted(r)).exp.topup).toBe(4_635_00n);
    expect(r.topupMargin).toBe(0n);
    expect(sectionsOf(counted(r)).find((s) => s.section === "topup")!.profit).toBe(0n);
    expect(incomeExpenseOf(counted(r)).inc.total).toBe(5_000_00n);
    expect(incomeExpenseOf(counted(r)).net).toBe(365_00n);
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

describe("report costs and cash", () => {
  it("counts each day's cost the same in any range, so a month is the sum of its days", () => {
    // 1 Nov: sold 100,000 that cost 70,000. 5 Nov: the shop starts recording purchases as
    // expense (500,000 of stock), so from that day what it bought is the cost.
    const purchaseFrom = "2026-11-05";
    const days = () => [
      row({ period: "2026-11-01", sales: 100_000_00n, salesCost: 70_000_00n }),
      row({ period: "2026-11-05", sales: 200_000_00n, salesCost: 150_000_00n, stockBought: 500_000_00n }),
    ];
    const net = (list: PeriodRow[]) => list.map((r) => incomeExpenseOf(counted(r, r.period >= purchaseFrom)).net);
    const [first, fifth] = net(days());
    expect(first).toBe(30_000_00n);
    expect(fifth).toBe(-300_000_00n);
    const month = days().reduce((t, r) => addRow(t, counted(r, r.period >= purchaseFrom)), row({ period: "2026-11" }));
    expect(incomeExpenseOf(month).net).toBe(first + fifth);
  });

  it("adds the sections up to the profit when float bought is the top-up cost", () => {
    const r = counted(row({ topup: 500_000_00n, topupMargin: 16_000_00n, floatBought: 480_000_00n, expTopup: 1_000_00n }), false, true);
    const sections = sectionsOf(r).reduce((a, s) => a + s.profit, 0n);
    expect(sections).toBe(incomeExpenseOf(r).net);
    expect(sections).toBe(19_000_00n);
  });

  it("does not count the reversal of a transfer between own wallets as cash", () => {
    const types = new Map([["e1", "TRANSFER_OUT"], ["e2", "EXPENSE"]]);
    expect(ledgerMovesCash(cashTypeOf({ refType: "REVERSAL", refId: "e1" }, types))).toBe(false);
    expect(ledgerMovesCash(cashTypeOf({ refType: "REVERSAL", refId: "e2" }, types))).toBe(true);
    // A cancelled sale points at the sale, not at an entry: cash comes back out.
    expect(ledgerMovesCash(cashTypeOf({ refType: "REVERSAL", refId: "sale-1" }, types))).toBe(true);
    expect(ledgerMovesCash(cashTypeOf({ refType: "TRANSFER_IN", refId: "t1" }, types))).toBe(false);
  });
});

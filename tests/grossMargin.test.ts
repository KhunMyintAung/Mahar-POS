import { describe, expect, it } from "vitest";
import { countCosts, grossMarginOf, type PeriodRow } from "../src/services/reportService";

const row = (over: Partial<PeriodRow>): PeriodRow => ({
  period: "2026-11", sales: 0n, salesCost: 0n, service: 0n, topup: 0n, topupMargin: 0n, billProfit: 0n, otherIncome: 0n,
  expense: 0n, salary: 0n, shares: 0n, cashIn: 0n, cashOut: 0n, expSales: 0n, expService: 0n, expTopup: 0n, expGeneral: 0n,
  directSales: 0n, directService: 0n, directTopup: 0n, floatBought: 0n, stockBought: 0n, costOfSales: 0n, topupCost: 0n,
  ...over,
});

describe("gross margin", () => {
  it("service: income less its own direct cost, not general expenses filed under it", () => {
    // 1,000,000 service income, 600,000 parts, plus 200,000 rent the settings put under Service.
    const r = row({ service: 1_000_000_00n, directService: 600_000_00n, expService: 800_000_00n });
    countCosts(r, false, false);
    const m = grossMarginOf(r);
    expect(m.service.profit).toBe(400_000_00n);
    expect(m.service.percent).toBe(40);
  });

  it("sales count goods at cost plus Daily Sale Expense", () => {
    const r = row({ sales: 95_000_00n, salesCost: 70_000_00n });
    countCosts(r, false, false);
    expect(grossMarginOf(r).sales.percent).toBe(26.3);
  });

  it("no income: no percent, and a loss shows below zero", () => {
    const r = row({ directService: 50_000_00n, sales: 100_00n, salesCost: 150_00n });
    countCosts(r, false, false);
    const m = grossMarginOf(r);
    expect(m.service.percent).toBeNull();
    expect(m.sales.percent).toBe(-50);
    expect(m.all.profit).toBe(-50_050_00n);
  });
});

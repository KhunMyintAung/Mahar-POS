import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_SETTINGS, distribute } from "../src/services/reportService";

describe("Boss Share leaving some for staff", () => {
  it("partners under 100% take exactly their percents; the rest is left", () => {
    const d = distribute(1_000_000_00n, { ...DEFAULT_REPORT_SETTINGS, reserve: { mode: "percent", value: 10 }, partners: [{ name: "Boss", percent: 60 }, { name: "Wife", percent: 20 }] }, 1);
    expect(d.reserve).toBe(100_000_00n);
    expect(d.partners.map((p) => p.amount)).toEqual([540_000_00n, 180_000_00n]);
    expect(d.left).toBe(180_000_00n);
  });
  it("partners at 100% (or all 0) leave nothing", () => {
    expect(distribute(500_000_00n, { ...DEFAULT_REPORT_SETTINGS, partners: [{ name: "Boss", percent: 100 }] }, 1).left).toBe(0n);
    expect(distribute(500_000_00n, { ...DEFAULT_REPORT_SETTINGS, partners: [{ name: "A", percent: 0 }, { name: "B", percent: 0 }] }, 1).left).toBe(0n);
  });
  it("a loss leaves nothing", () => {
    expect(distribute(-5_000_00n, { ...DEFAULT_REPORT_SETTINGS, partners: [{ name: "Boss", percent: 50 }] }, 1).left).toBe(0n);
  });
});

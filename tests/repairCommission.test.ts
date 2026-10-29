import { describe, expect, it } from "vitest";
import { repairCommission } from "@/services/technicianService";

const job = { finalCost: 50_000_00n, partsCost: 20_000_00n };

describe("repairCommission", () => {
  it("pays a percent of what the repair made, after parts", () => {
    expect(repairCommission(job, { mode: "PERCENT", percent: "10", amount: 0n })).toBe(3_000_00n);
  });

  it("pays nothing on a percent when the parts cost as much as the charge", () => {
    expect(repairCommission({ finalCost: 10_000_00n, partsCost: 12_000_00n }, { mode: "PERCENT", percent: "10", amount: 0n })).toBe(0n);
  });

  it("pays a fixed sum per repair whatever it charged", () => {
    expect(repairCommission(job, { mode: "AMOUNT", percent: "0", amount: 5_000_00n })).toBe(5_000_00n);
  });

  it("pays nothing without a rule", () => {
    expect(repairCommission(job, { mode: "NONE", percent: "10", amount: 5_000_00n })).toBe(0n);
  });
});

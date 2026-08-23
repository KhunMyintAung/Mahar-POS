import { describe, expect, it } from "vitest";
import { floatDelta, txnProfit } from "@/services/billerService";

/** The sign rules are the whole risk here: get one backwards and a shop's float drifts
 *  further from the operator's figure with every trade, quietly, until someone counts. */

describe("floatDelta", () => {
  it("raises the float when credit is bought", () => {
    expect(floatDelta("TOPUP", 10_000_00n)).toBe(10_000_00n);
  });

  it("lowers the float when credit is sold on", () => {
    expect(floatDelta("SALE", 5_000_00n)).toBe(-5_000_00n);
  });

  it("takes an adjustment at the sign it was given", () => {
    expect(floatDelta("ADJUST", -2_000_00n)).toBe(-2_000_00n);
    expect(floatDelta("ADJUST", 2_000_00n)).toBe(2_000_00n);
  });
});

describe("txnProfit", () => {
  it("counts the operator's discount as the margin on a purchase", () => {
    // 100,000 of credit bought for 98,000.
    expect(txnProfit("TOPUP", 100_000_00n, 98_000_00n)).toBe(2_000_00n);
  });

  it("is nothing when credit is sold at face value", () => {
    expect(txnProfit("SALE", 5_000_00n, 5_000_00n)).toBe(0n);
  });

  it("goes negative when a customer is given a discount", () => {
    expect(txnProfit("SALE", 5_000_00n, 4_900_00n)).toBe(-100_00n);
  });

  it("earns nothing on a correction, which moved no money", () => {
    expect(txnProfit("ADJUST", -2_000_00n, 0n)).toBe(0n);
  });
});

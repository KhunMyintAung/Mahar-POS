import { describe, expect, it } from "vitest";
import { roundUpBill, roundUpBillMinor } from "../src/lib/billRound";

describe("bill sale price", () => {
  it("is the amount rounded up to the next thousand", () => {
    expect(roundUpBill(4635)).toBe(5000);
    expect(roundUpBill(3656)).toBe(4000);
    expect(roundUpBill(3000)).toBe(3000);
    expect(roundUpBill(40000)).toBe(40000);
    expect(roundUpBill(0)).toBe(0);
  });

  it("works the same in minor units", () => {
    expect(roundUpBillMinor(4_635_00n)).toBe(5_000_00n);
    expect(roundUpBillMinor(3_000_00n)).toBe(3_000_00n);
    expect(roundUpBillMinor(1n)).toBe(1_000_00n);
    expect(roundUpBillMinor(0n)).toBe(0n);
  });
});

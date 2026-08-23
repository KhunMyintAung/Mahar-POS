import { describe, it, expect } from "vitest";
import { toMinor, formatMinor, mulMinor, percentOf, minorToDecimalString, isThreeDigit, MoneyError } from "../src/lib/money";

describe("money", () => {
  it("parses amounts to minor units", () => {
    expect(toMinor("5000")).toBe(500000n);
    expect(toMinor("1,500.25")).toBe(150025n);
    expect(toMinor("0.01")).toBe(1n);
    expect(toMinor("-42")).toBe(-4200n);
  });

  it("rejects invalid amounts", () => {
    expect(() => toMinor("abc")).toThrow(MoneyError);
    expect(() => toMinor("12.3.4")).toThrow(MoneyError);
    expect(() => toMinor("")).toThrow(MoneyError);
  });

  it("rounds sub-minor amounts half-up", () => {
    expect(toMinor("0.005")).toBe(1n);
    expect(toMinor("0.004")).toBe(0n);
  });

  it("formats minor units with separators", () => {
    expect(formatMinor(150000000n)).toBe("1,500,000");
    expect(formatMinor(150025n)).toBe("1,500.25");
    expect(formatMinor(-500000n)).toBe("-5,000");
  });

  it("multiplies by decimal string factors without float error", () => {
    expect(mulMinor(500000n, "500")).toBe(250000000n); // 5,000 × 500 odds
    expect(mulMinor(100n, "129.5")).toBe(12950n); // 1 THB @ 129.5
    expect(mulMinor(3n, "0.1")).toBe(0n); // rounds half-up: 0.3 → 0
  });

  it("computes percentages", () => {
    expect(percentOf(500000n, "10")).toBe(50000n); // 10% of 5,000
    expect(percentOf(333333n, "10")).toBe(33333n);
    expect(percentOf(500000n, "0")).toBe(0n);
  });

  it("converts minor units to decimal strings", () => {
    expect(minorToDecimalString(150025n)).toBe("1500.25");
    expect(minorToDecimalString(0n)).toBe("0.00");
  });

  it("validates 3D numbers with leading zeros", () => {
    expect(isThreeDigit("001")).toBe(true);
    expect(isThreeDigit("010")).toBe(true);
    expect(isThreeDigit("100")).toBe(true);
    expect(isThreeDigit("000")).toBe(true);
    expect(isThreeDigit("999")).toBe(true);
    expect(isThreeDigit("1")).toBe(false);
    expect(isThreeDigit("12")).toBe(false);
    expect(isThreeDigit("1000")).toBe(false);
    expect(isThreeDigit("0a1")).toBe(false);
  });
});

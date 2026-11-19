import { describe, expect, it } from "vitest";
import { crc16, promptPayWithAmount } from "@/lib/promptpay";
import { DEFAULT_ABOUT } from "@/lib/about";
import { proTotalMMK, proTotalTHB, tierOf } from "@/lib/plan";

const STATIC = DEFAULT_ABOUT.promptPayPayload;

describe("promptpay", () => {
  it("crc16 reproduces the checksum of the real static code (so the algorithm is right)", () => {
    expect(crc16(STATIC.slice(0, -4))).toBe(STATIC.slice(-4));
  });

  it("fixes the amount: dynamic marker, tag 54 before the country, and a valid checksum", () => {
    const out = promptPayWithAmount(STATIC, 260);
    expect(out.startsWith("000201010212")).toBe(true);
    expect(out).toContain("5406260.00" + "5802TH");
    expect(crc16(out.slice(0, -4))).toBe(out.slice(-4));
  });

  it("leaves a code it does not understand, or a bad amount, unchanged", () => {
    expect(promptPayWithAmount(STATIC, 0)).toBe(STATIC);
    expect(promptPayWithAmount(STATIC, -5)).toBe(STATIC);
    expect(promptPayWithAmount("not a code", 100)).toBe("not a code");
  });
});

describe("pro pricing", () => {
  it("is monthly price × months, less the 6-month and 12-month savings", () => {
    expect(proTotalMMK("PRO", 1)).toBe(15000);
    expect(proTotalMMK("PRO", 3)).toBe(45000);
    expect(proTotalMMK("PRO", 6)).toBe(85000);
    expect(proTotalMMK("PRO", 12)).toBe(170000);
    expect(proTotalMMK("FULL", 1)).toBe(50000);
    expect(proTotalMMK("FULL", 12)).toBe(590000);
  });

  it("reads an unknown or empty tier as PRO", () => {
    expect(tierOf("FULL")).toBe("FULL");
    expect(tierOf(null)).toBe("PRO");
    expect(tierOf("whatever")).toBe("PRO");
  });

  it("has its own baht price list for Thai shops, with the same 6-month and 12-month savings shape", () => {
    expect(proTotalTHB("PRO", 1)).toBe(200);
    expect(proTotalTHB("PRO", 3)).toBe(600);
    expect(proTotalTHB("PRO", 6)).toBe(1150); // 1200 − 50
    expect(proTotalTHB("PRO", 12)).toBe(2300); // 2400 − 100
    expect(proTotalTHB("FULL", 1)).toBe(300);
    expect(proTotalTHB("FULL", 6)).toBe(1750); // 1800 − 50
    expect(proTotalTHB("FULL", 12)).toBe(3500); // 3600 − 100
  });
});

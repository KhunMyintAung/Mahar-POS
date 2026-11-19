import { describe, expect, it } from "vitest";
import { crc16, promptPayWithAmount } from "@/lib/promptpay";
import { DEFAULT_ABOUT } from "@/lib/about";
import { proTotalMMK, thbForMMK, tierOf } from "@/lib/plan";

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

  it("rounds baht up to the next 10, and is null without a rate", () => {
    expect(thbForMMK(15000, 60)).toBe(250);
    expect(thbForMMK(15000, 65)).toBe(240); // 230.77 → 240
    expect(thbForMMK(15000, null)).toBeNull();
    expect(thbForMMK(15000, 0)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { centiToWei, fmtMsp, normalizeMspAddress } from "../src/lib/msp";

describe("Mahar Shwe Point", () => {
  it("converts hundredths to 18-decimal token units", () => {
    expect(centiToWei(100n)).toBe(10n ** 18n);
    expect(centiToWei(1n)).toBe(10n ** 16n);
  });

  it("formats points", () => {
    expect(fmtMsp(2500n)).toBe("25");
    expect(fmtMsp(1250n)).toBe("12.5");
    expect(fmtMsp(5n)).toBe("0.05");
    expect(fmtMsp("123")).toBe("1.23");
  });

  it("accepts only wallet addresses, checksummed", () => {
    expect(normalizeMspAddress(" 0x2569b4df18c44a67cd98d1a307aa1efe45d0621d ")).toBe("0x2569b4dF18c44a67CD98d1a307aA1efE45d0621D");
    expect(normalizeMspAddress("0x123")).toBeNull();
    expect(normalizeMspAddress("09123456789")).toBeNull();
  });
});

describe("MSP for using Mahar POS", () => {
  it("reads the shop's reward switch defensively", async () => {
    const { parseRewardSettings } = await import("../src/lib/mspRewards");
    expect(parseRewardSettings(undefined)).toEqual({ on: false, wallet: null, since: null });
    expect(parseRewardSettings({ on: true, wallet: "0x2569b4df18c44a67cd98d1a307aa1efe45d0621d", since: "2026-10-30" }))
      .toEqual({ on: true, wallet: "0x2569b4dF18c44a67CD98d1a307aA1efE45d0621D", since: "2026-10-30" });
    expect(parseRewardSettings({ on: 1, wallet: "nope", since: "yesterday" })).toEqual({ on: true, wallet: null, since: null });
  });

  it("counts only today and yesterday, never before the shop switched on", async () => {
    const { rewardDays } = await import("../src/lib/mspRewards");
    expect(rewardDays("2026-10-30", "2026-10-29", "2026-10-01")).toEqual(["2026-10-29", "2026-10-30"]);
    expect(rewardDays("2026-10-30", "2026-10-29", "2026-10-30")).toEqual(["2026-10-30"]);
    expect(rewardDays("2026-10-30", "2026-10-29", null)).toEqual([]);
  });

  it("gives 1 MSP to start and 0.01 MSP a day", async () => {
    const { WELCOME_CENTI, DAILY_CENTI } = await import("../src/lib/mspRewards");
    expect(fmtMsp(WELCOME_CENTI)).toBe("1");
    expect(fmtMsp(DAILY_CENTI)).toBe("0.01");
  });
});

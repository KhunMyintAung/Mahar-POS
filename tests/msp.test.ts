import { describe, it, expect } from "vitest";
import { buildBatch, centiPointsFor, centiToWei, fmtMsp, MAX_BATCH_RECIPIENTS, normalizeMspAddress, parseMspSettings } from "../src/lib/msp";

describe("Mahar Shwe Point", () => {
  it("earns one point per perPoint spent, in hundredths, rounded down", () => {
    expect(centiPointsFor(1_000_00n, 1000)).toBe(100n);   // 1,000 MMK → 1 MSP
    expect(centiPointsFor(25_000_00n, 1000)).toBe(2500n); // 25,000 → 25 MSP
    expect(centiPointsFor(1_234_56n, 1000)).toBe(123n);   // 1,234.56 → 1.23 MSP
    expect(centiPointsFor(9n, 1000)).toBe(0n);
    expect(centiPointsFor(0n, 1000)).toBe(0n);
    expect(centiPointsFor(-5_000_00n, 1000)).toBe(0n);
  });

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

  it("reads settings defensively", () => {
    expect(parseMspSettings(undefined)).toEqual({ enabled: false, perPoint: 1000 });
    expect(parseMspSettings({ enabled: true, perPoint: 500 })).toEqual({ enabled: true, perPoint: 500 });
    expect(parseMspSettings({ enabled: 1, perPoint: 0 })).toEqual({ enabled: true, perPoint: 1000 });
    expect(parseMspSettings({ perPoint: 2.5 }).perPoint).toBe(1000);
  });

  it("accepts only wallet addresses, checksummed", () => {
    expect(normalizeMspAddress(" 0x2569b4df18c44a67cd98d1a307aa1efe45d0621d ")).toBe("0x2569b4dF18c44a67CD98d1a307aA1efE45d0621D");
    expect(normalizeMspAddress("0x123")).toBeNull();
    expect(normalizeMspAddress("09123456789")).toBeNull();
  });

  it("sums a batch per wallet and leaves wallets past the limit for later", () => {
    const a = "0x2569b4dF18c44a67CD98d1a307aA1efE45d0621D", b = "0x669ADe28fF14b11274A7FaF349A6d9D56E7D7A73";
    const r = buildBatch([
      { id: "1", address: a, amount: 100n },
      { id: "2", address: b, amount: 50n },
      { id: "3", address: a.toLowerCase(), amount: 25n },
    ]);
    expect(r.recipients).toEqual([{ address: a, amount: 125n }, { address: b, amount: 50n }]);
    expect(r.ids).toEqual(["1", "2", "3"]);
    expect(r.total).toBe(175n);

    const many = Array.from({ length: MAX_BATCH_RECIPIENTS + 5 }, (_, i) => ({
      id: String(i), address: "0x" + (i + 1).toString(16).padStart(40, "0"), amount: 1n,
    }));
    const capped = buildBatch(many);
    expect(capped.recipients).toHaveLength(MAX_BATCH_RECIPIENTS);
    expect(capped.ids).toHaveLength(MAX_BATCH_RECIPIENTS);
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

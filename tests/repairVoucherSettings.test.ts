import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPAIR_VOUCHER,
  formatVoucherNo,
  parseRepairVoucherSettings,
} from "@/lib/repairVoucherSettings";

describe("repair voucher settings", () => {
  it("numbers vouchers the shop's way", () => {
    expect(formatVoucherNo("MS", 3, 1)).toBe("MS001");
    expect(formatVoucherNo("MS", 3, 999)).toBe("MS999");
    // Grows past the minimum rather than wrapping.
    expect(formatVoucherNo("MS", 3, 1197)).toBe("MS1197");
  });

  it("falls back to defaults for anything missing or malformed", () => {
    expect(parseRepairVoucherSettings(null)).toEqual(DEFAULT_REPAIR_VOUCHER);
    const parsed = parseRepairVoucherSettings({ prefix: "M S!", digits: 99, terms: "nope" });
    expect(parsed.prefix).toBe("");
    expect(parsed.digits).toBe(4);
    expect(parsed.terms).toEqual(DEFAULT_REPAIR_VOUCHER.terms);
  });

  it("keeps what the shop set", () => {
    const parsed = parseRepairVoucherSettings({
      prefix: "ms", digits: 4, tagline: "Phone repair", terms: ["Keep your SIM", "", "  "], qrCaption: "Scan me",
    });
    expect(parsed).toEqual({ prefix: "MS", digits: 4, tagline: "Phone repair", terms: ["Keep your SIM"], qrCaption: "Scan me" });
  });

  it("lets a shop print no warnings at all", () => {
    expect(parseRepairVoucherSettings({ terms: [] }).terms).toEqual([]);
  });
});

describe("voucher letters from the shop name", () => {
  it("takes the initials of the first two words", async () => {
    const { shopPrefix } = await import("@/lib/repairVoucherSettings");
    expect(shopPrefix("Mahar Shwe Mobile Shop")).toBe("MS");
    expect(shopPrefix("Test Phone Shop")).toBe("TP");
  });

  it("keeps a short all-capitals first word as it is", async () => {
    const { shopPrefix } = await import("@/lib/repairVoucherSettings");
    expect(shopPrefix("AC Mobile")).toBe("AC");
    expect(shopPrefix("ABC Phone Centre")).toBe("ABC");
  });

  it("copes with one word or no Latin letters", async () => {
    const { shopPrefix } = await import("@/lib/repairVoucherSettings");
    expect(shopPrefix("Galaxy")).toBe("GA");
    expect(shopPrefix("မဟာရွှေ ဖုန်းဆိုင်")).toBe("RP");
  });

  it("numbers with four digits by default", async () => {
    const { formatVoucherNo, DEFAULT_REPAIR_VOUCHER } = await import("@/lib/repairVoucherSettings");
    expect(formatVoucherNo("MS", DEFAULT_REPAIR_VOUCHER.digits, 1)).toBe("MS0001");
    expect(formatVoucherNo("AC", DEFAULT_REPAIR_VOUCHER.digits, 1201)).toBe("AC1201");
  });
});

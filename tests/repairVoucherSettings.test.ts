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
    expect(parsed.digits).toBe(3);
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

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
    expect(parsed).toEqual({ prefix: "MS", digits: 4, language: "auto", tagline: "Phone repair", terms: ["Keep your SIM"], qrCaption: "Scan me" });
  });

  it("writes the voucher in the language of the shop's main currency", async () => {
    const { voucherLanguage } = await import("@/lib/repairVoucherSettings");
    const { VOUCHER_TEXT } = await import("@/lib/repairVoucherText");
    expect(voucherLanguage("auto", "THB")).toBe("th");
    expect(voucherLanguage("auto", "USD")).toBe("en");
    expect(voucherLanguage("auto", "MMK")).toBe("mm");
    // A shop may still pick one: a Myanmar-run shop in Thailand, say.
    expect(voucherLanguage("mm", "THB")).toBe("mm");
    // A shop that set nothing gets the ready-made warnings in its own language.
    expect(parseRepairVoucherSettings(null, "THB").terms).toEqual(VOUCHER_TEXT.th.terms);
    expect(parseRepairVoucherSettings(null, "USD").qrCaption).toBe(VOUCHER_TEXT.en.qrCaption);
  });

  it("moves ready-made warnings to a new language but keeps the shop's own", () => {
    // Saved while Myanmar, then the voucher language set to Thai.
    const moved = parseRepairVoucherSettings({ language: "th", terms: DEFAULT_REPAIR_VOUCHER.terms, qrCaption: DEFAULT_REPAIR_VOUCHER.qrCaption }, "MMK");
    expect(moved.terms[0]).toMatch(/[฀-๿]/);
    expect(moved.qrCaption).toMatch(/[฀-๿]/);
    const own = parseRepairVoucherSettings({ language: "th", terms: ["Keep your SIM"], qrCaption: "Scan me" }, "MMK");
    expect(own.terms).toEqual(["Keep your SIM"]);
    expect(own.qrCaption).toBe("Scan me");
  });

  it("has every word of the voucher in each language, with no Myanmar on a Thai or English one", async () => {
    const { VOUCHER_TEXT, TRACK_TEXT } = await import("@/lib/repairVoucherText");
    const { REPAIR_STATUSES } = await import("@/lib/repairStatus");
    for (const lang of ["mm", "en", "th"] as const) {
      for (const s of REPAIR_STATUSES) {
        expect(VOUCHER_TEXT[lang].statuses[s], `${lang} ${s}`).toBeTruthy();
        expect(TRACK_TEXT[lang].headline[s], `${lang} ${s}`).toBeTruthy();
      }
      expect(VOUCHER_TEXT[lang].terms).toHaveLength(6);
    }
    for (const lang of ["en", "th"] as const) {
      expect(JSON.stringify([VOUCHER_TEXT[lang], TRACK_TEXT[lang]])).not.toMatch(/[က-႟]/);
    }
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

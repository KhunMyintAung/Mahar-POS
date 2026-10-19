import { describe, expect, it } from "vitest";
import {
  DEFAULT_WARRANTY,
  parseWarrantySettings,
  phoneCondition,
  warrantyOptionsFor,
  warrantyTermsFor,
  warrantyUntil,
} from "@/lib/warranty";

const item = (name: string, category?: string) => ({ name, category: category ? { name: category } : undefined });

describe("phone condition", () => {
  it("reads new and second-hand off the category", () => {
    expect(phoneCondition(item("Vivo Y28", "Phone New"))).toBe("NEW");
    expect(phoneCondition(item("Vivo Y28", "Phone Second"))).toBe("SECOND");
    expect(phoneCondition(item("Redmi Note 12", "Phone Secount"))).toBe("SECOND");
    expect(phoneCondition(item("Redmi Note 12", "ဖုန်း အဟောင်း"))).toBe("SECOND");
    expect(phoneCondition(item("Samsung A15", "ဖုန်း အသစ်"))).toBe("NEW");
  });

  it("reads second-hand first, so 'like new' second-hand stays second-hand", () => {
    expect(phoneCondition(item("Like new iPhone 12", "Phone Second"))).toBe("SECOND");
  });

  it("gives no warranty choice to accessories or unmarked phones", () => {
    expect(phoneCondition(item("Type-C Cable 1m", "Chargers & Cables"))).toBeNull();
    expect(phoneCondition(item("New Phone Case", "Cases"))).toBeNull();
    expect(phoneCondition(item("Vivo Y28", "Phones"))).toBeNull();
  });

  it("picks the matching list", () => {
    expect(warrantyOptionsFor(DEFAULT_WARRANTY, "NEW")[0].days).toBe(365);
    expect(warrantyOptionsFor(DEFAULT_WARRANTY, "SECOND")[0].days).toBe(30);
    expect(warrantyOptionsFor(DEFAULT_WARRANTY, null)).toEqual([]);
  });
});

describe("warranty settings", () => {
  it("defaults when nothing is stored", () => {
    expect(parseWarrantySettings(undefined)).toEqual(DEFAULT_WARRANTY);
  });

  it("keeps a shop's own options and drops bad ones", () => {
    const parsed = parseWarrantySettings({
      newPhone: [{ label: "2 years", days: 730 }, { label: "", days: 5 }, { label: "Odd", days: -3 }],
      secondHand: [],
    });
    expect(parsed.newPhone).toEqual([{ label: "2 years", days: 730 }, { label: "Odd", days: 0 }]);
    expect(parsed.secondHand).toEqual([]);
  });

  it("prints the terms for the phone's condition, defaulting to the new-phone ones", () => {
    const s = parseWarrantySettings({ newTerms: "NEW TERMS", secondTerms: "USED TERMS" });
    expect(warrantyTermsFor(s, "NEW")).toBe("NEW TERMS");
    expect(warrantyTermsFor(s, "SECOND")).toBe("USED TERMS");
    expect(warrantyTermsFor(s, null)).toBe("NEW TERMS");
    expect(parseWarrantySettings({}).newTerms).toContain("Brand New");
  });

  it("counts the end date from the sale", () => {
    const sold = new Date("2026-10-19T10:00:00Z");
    expect(warrantyUntil(sold, 30)?.toISOString()).toBe("2026-11-18T10:00:00.000Z");
    expect(warrantyUntil(sold, 0)).toBeNull();
  });
});

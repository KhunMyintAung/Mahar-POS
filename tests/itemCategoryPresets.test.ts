import { describe, expect, it } from "vitest";
import { MINI_MART_ITEM_CATEGORIES, PHONE_SHOP_ITEM_CATEGORIES, itemCategoryPresets } from "@/lib/itemCategoryPresets";
import { phoneCondition } from "@/lib/warranty";

describe("item category presets", () => {
  it("gives a phone shop and a mini mart each their own categories, and others none", () => {
    expect(itemCategoryPresets("MOBILE_SHOP")).toBe(PHONE_SHOP_ITEM_CATEGORIES);
    expect(itemCategoryPresets("MINI_MART")).toBe(MINI_MART_ITEM_CATEGORIES);
    expect(itemCategoryPresets(undefined)).toEqual([]);
  });

  it("gives a mini mart nothing to do with phones", () => {
    const phoneWords = /phone|glass|spare|charger|case|tablet|watch|power bank|memory/i;
    expect(MINI_MART_ITEM_CATEGORIES.filter((c) => phoneWords.test(c))).toEqual([]);
  });

  it("names the phone categories so the till offers the right warranty", () => {
    expect(phoneCondition({ name: "Vivo Y28", category: { name: "Phone New" } })).toBe("NEW");
    expect(phoneCondition({ name: "iPhone 11", category: { name: "Phone Second" } })).toBe("SECOND");
    expect(phoneCondition({ name: "Type-C Cable", category: { name: "Chargers & Cables" } })).toBeNull();
  });
});

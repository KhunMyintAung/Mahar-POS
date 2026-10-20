import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, PHONE_SHOP_CSV_TEMPLATE, csvTemplateFor, parseProductCsv } from "@/lib/productCsv";

describe("product CSV templates", () => {
  it("gives a phone shop its own examples", () => {
    expect(csvTemplateFor("MOBILE_SHOP").csv).toBe(PHONE_SHOP_CSV_TEMPLATE);
    expect(csvTemplateFor("MOBILE_SHOP").fileName).toBe("phone-shop-products.csv");
  });

  it("keeps the mini mart examples for everyone else", () => {
    expect(csvTemplateFor("MINI_MART").csv).toBe(CSV_TEMPLATE);
    expect(csvTemplateFor("CUSTOM").csv).toBe(CSV_TEMPLATE);
    expect(csvTemplateFor(undefined).csv).toBe(CSV_TEMPLATE);
  });

  it("imports cleanly as downloaded, so a shop can start from it", () => {
    for (const template of [CSV_TEMPLATE, PHONE_SHOP_CSV_TEMPLATE]) {
      const parsed = parseProductCsv(`﻿${template}`);
      expect(parsed.rejected).toEqual([]);
      expect(parsed.unknownColumns).toEqual([]);
      expect(parsed.products.length).toBe(template.split("\n").length - 1);
    }
  });

  it("files phones and accessories under their own categories", () => {
    const categories = new Set(parseProductCsv(PHONE_SHOP_CSV_TEMPLATE).products.map((p) => p.category));
    expect(categories).toEqual(new Set(["Phone New", "Phone Second", "Chargers & Cables", "Glass", "Cases", "Spare Parts"]));
  });
});

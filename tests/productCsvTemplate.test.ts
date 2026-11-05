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

  it("files phones and accessories under categories and sub-categories", () => {
    const products = parseProductCsv(PHONE_SHOP_CSV_TEMPLATE).products;
    expect(new Set(products.map((p) => p.category))).toEqual(new Set(["Phone", "Accessory", "Spare Parts"]));
    expect(products.filter((p) => p.category === "Phone").map((p) => p.subCategory)).toEqual(["New", "Second"]);
    expect(products.find((p) => p.name.startsWith("Wireless Earphone"))?.subCategory).toBe("Earphone");
  });

  it("reads a sub-category from its own column or from one cell", () => {
    const parsed = parseProductCsv([
      "name,category,sub category,price",
      "A,Accessory,Adapter,100",
      "B,Accessory > Earphone,,100",
      "C,Phone › Second,,100",
      "D,,Glass,100",
      "E,Grocery,,100",
    ].join("\n"));
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.products.map((p) => [p.category, p.subCategory])).toEqual([
      ["Accessory", "Adapter"], ["Accessory", "Earphone"], ["Phone", "Second"], ["Glass", ""], ["Grocery", ""],
    ]);
  });

  it("knows the Myanmar sub-category header", () => {
    const parsed = parseProductCsv("အမည်,အမျိုးအစား,အမျိုးအစားခွဲ,ရောင်းဈေး\nVivo,Phone,New,100");
    expect(parsed.products[0].subCategory).toBe("New");
  });
});

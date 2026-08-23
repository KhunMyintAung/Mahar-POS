import { describe, expect, it } from "vitest";
import { parseProductCsv, readAmount, splitCsvLine } from "@/lib/productCsv";
import { skuCandidate, skuPrefix, generateSku } from "@/lib/sku";

describe("splitCsvLine", () => {
  it("keeps a comma that is inside quotes", () => {
    expect(splitCsvLine('Coca Cola,"Drinks, cold",800')).toEqual(["Coca Cola", "Drinks, cold", "800"]);
  });

  it("reads a doubled quote as one quote", () => {
    expect(splitCsvLine('"5"" pipe",100')).toEqual(['5" pipe', "100"]);
  });

  it("keeps empty cells in place", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("readAmount", () => {
  it("accepts the ways a shop writes a price", () => {
    expect(readAmount("1500")).toBe("1500");
    expect(readAmount("1,500")).toBe("1500");
    expect(readAmount("1500.50")).toBe("1500.50");
    expect(readAmount("")).toBe("0");
  });

  it("refuses what is not a price", () => {
    expect(readAmount("abc")).toBeNull();
    expect(readAmount("1500 kyat")).toBeNull();
  });
});

describe("parseProductCsv", () => {
  it("reads a file exported from a spreadsheet, BOM and all", () => {
    const csv = "﻿name,sku,price,qty\r\nRice 5kg,RICE5,14000,10\r\n";
    const { products, rejected } = parseProductCsv(csv);
    expect(rejected).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ name: "Rice 5kg", sku: "RICE5", sellingPrice: "14000", quantity: 10 });
  });

  it("takes the column names another shop's system would have used", () => {
    const csv = "Product Name,Item Code,Selling Price,Stock Quantity\nSoap,SP1,700,5";
    const { products, unknownColumns } = parseProductCsv(csv);
    expect(unknownColumns).toEqual([]);
    expect(products[0]).toMatchObject({ name: "Soap", sku: "SP1", sellingPrice: "700", quantity: 5 });
  });

  it("names a column it did not understand rather than ignoring it quietly", () => {
    const { unknownColumns } = parseProductCsv("name,colour\nSoap,red");
    expect(unknownColumns).toEqual(["colour"]);
  });

  it("reports each bad row with its line number and keeps the good ones", () => {
    const csv = [
      "name,price,qty",
      "Good,100,1",
      ",200,1",
      "Bad price,abc,1",
      "Bad qty,100,half",
      "Also good,300,2",
    ].join("\n");
    const { products, rejected } = parseProductCsv(csv);
    expect(products.map((p) => p.name)).toEqual(["Good", "Also good"]);
    expect(rejected.map((r) => r.row)).toEqual([3, 4, 5]);
    expect(rejected[0].reason).toMatch(/No product name/);
    expect(rejected[1].reason).toMatch(/not a number/);
    expect(rejected[2].reason).toMatch(/whole number/);
  });

  it("catches a SKU repeated inside the file", () => {
    const csv = "name,sku\nOne,SAME\nTwo,SAME";
    const { products, rejected } = parseProductCsv(csv);
    expect(products).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/more than once/);
  });

  it("ignores blank lines rather than calling them errors", () => {
    const { products, rejected } = parseProductCsv("name,price\n\nSoap,700\n\n");
    expect(products).toHaveLength(1);
    expect(rejected).toEqual([]);
  });
});

describe("generated SKUs", () => {
  it("is built from the product's own name", () => {
    expect(skuPrefix("Coca Cola 330ml")).toBe("COCACO");
    expect(skuCandidate("Rice 5kg", 1)).toBe("RICE5K-0001");
  });

  it("falls back for a name with no latin letters at all", () => {
    expect(skuPrefix("ဆပ်ပြာ")).toBe("ITM");
  });

  it("steps past codes that are already taken", async () => {
    const used = new Set(["SOAP-0001", "SOAP-0002"]);
    const sku = await generateSku("Soap", async (candidate) => used.has(candidate));
    expect(sku).toBe("SOAP-0003");
  });
});

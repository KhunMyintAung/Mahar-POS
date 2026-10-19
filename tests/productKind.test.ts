import { describe, expect, it } from "vitest";
import { productKind } from "@/lib/productKind";

const kind = (name: string, category?: string) =>
  productKind({ name, category: category ? { name: category } : undefined });

describe("product kind", () => {
  it("knows a phone by brand or word", () => {
    expect(kind("Vivo Y28 (8/128GB)")).toBe("phone");
    expect(kind("Redmi Note 13")).toBe("phone");
    expect(kind("Galaxy A15", "Phones")).toBe("phone");
    expect(kind("ဖုန်း အသစ်")).toBe("phone");
  });

  it("puts accessories ahead of the phone they fit", () => {
    expect(kind("Phone Case - Redmi Note 13")).toBe("cover");
    expect(kind("Tempered Glass - Vivo Y28")).toBe("cover");
    expect(kind("Vivo 33W Fast Charger")).toBe("charger");
    expect(kind("Type-C Cable 1m")).toBe("cable");
    expect(kind("Samsung Galaxy Buds earbuds")).toBe("earphone");
  });

  it("uses the category when the name says little", () => {
    expect(kind("X1 Pro", "Chargers & Cables")).toBe("charger");
    expect(kind("Model 7", "Audio Speaker")).toBe("speaker");
    expect(kind("Tool kit", "Gadget")).toBe("accessory");
  });

  it("falls back to a plain product", () => {
    expect(kind("Coca Cola 330ml", "Drinks")).toBe("product");
    expect(kind("Rice 5kg")).toBe("product");
  });
});

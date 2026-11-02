import { describe, expect, it } from "vitest";
import { storefrontOrder, storefrontProducts } from "../src/lib/storefrontApi";

const item = (id: string, name: string, extra: Partial<{ model: string; variant: string; category: string; price: bigint; stock: number; images: string[] }> = {}) => ({
  id, name, description: "", category: extra.category ?? "Phone", price: extra.price ?? 100_000_00n, stock: extra.stock ?? 3,
  images: extra.images ?? [], model: extra.model ?? "", variant: extra.variant ?? "",
});

describe("storefront products", () => {
  const items = [
    item("a", "iPhone 13 128GB", { model: "iPhone 13", variant: "128GB", price: 1_800_000_00n, images: ["img1"] }),
    item("b", "iPhone 13 256GB", { model: "iPhone 13", variant: "256GB", price: 2_100_000_00n, stock: 0 }),
    item("c", "Type-C Cable", { category: "Accessories", price: 5_000_00n }),
  ];

  it("shows one product per model with its items as variants, in whole kyat", () => {
    const r = storefrontProducts(items, { page: 1, search: "", categoryId: "", stockLevel: "" });
    expect(r.total).toBe(2);
    const phone = r.products[0];
    expect(phone).toMatchObject({ id: "a", name: "iPhone 13", category: { id: "Phone", name: "Phone" } });
    expect(phone.variants.map((v) => [v.id, v.variantName, v.standardSellingPrice, v.inventoryBalance.quantity])).toEqual([
      ["a", "128GB", "1800000", 3],
      ["b", "256GB", "2100000", 0],
    ]);
    expect(phone.ecommerceImages).toEqual([{ id: "img1", url: "/api/public/item-image/img1" }]);
    expect(r.products[1].variants[0].variantName).toBe("Default");
    expect(r.categories.map((c) => c.id)).toEqual(["Accessories", "Phone"]);
  });

  it("filters by search, category and stock", () => {
    expect(storefrontProducts(items, { page: 1, search: "cable", categoryId: "", stockLevel: "" }).products.map((p) => p.id)).toEqual(["c"]);
    expect(storefrontProducts(items, { page: 1, search: "", categoryId: "Accessories", stockLevel: "" }).total).toBe(1);
    const inStock = storefrontProducts(items, { page: 1, search: "", categoryId: "Phone", stockLevel: "IN_STOCK" });
    expect(inStock.products[0].variants.map((v) => v.id)).toEqual(["a"]);
  });

  it("pages ten at a time", () => {
    const many = Array.from({ length: 23 }, (_, i) => item(`i${i}`, `Item ${i}`));
    const r = storefrontProducts(many, { page: 3, search: "", categoryId: "", stockLevel: "" });
    expect([r.page, r.totalPages, r.products.length]).toEqual([3, 3, 3]);
  });
});

describe("storefront order", () => {
  it("reads as the page's order, in whole kyat", () => {
    const o = storefrontOrder({ orderNo: "ORD-00007", createdAt: new Date("2026-11-02T10:00:00Z"), total: 1_400_00n, lines: [{ itemId: "c", name: "Cola", quantity: 2, unitPrice: 700_00n }] });
    expect(o).toEqual({
      id: "ORD-00007", orderNumber: "ORD-00007", status: "PENDING", total: "1400", createdAt: "2026-11-02T10:00:00.000Z",
      items: [{ productVariantId: "c", productNameSnapshot: "Cola", quantity: 2, lineTotal: "1400" }],
    });
  });
});

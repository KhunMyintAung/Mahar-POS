import { describe, expect, it } from "vitest";
import { itemLines, saleNotice } from "@/lib/telegramNotify";

describe("saleNotice", () => {
  it("says what was sold, not only what it came to", () => {
    const text = saleNotice({
      txnNo: "SAL-000006",
      total: 12_000_00n,
      profit: 6_670_00n,
      createdByName: "Mahar Shwe Mobile",
      items: [
        { name: "F11 iGlass", quantity: 2 },
        { name: "2031R Charger IOS", quantity: 1 },
      ],
    });
    expect(text).toContain("• F11 iGlass × 2");
    expect(text).toContain("• 2031R Charger IOS × 1");
    expect(text).toContain("Total: 12,000 MMK");
  });

  it("still reads sensibly for a sale with no lines to name", () => {
    const text = saleNotice({
      txnNo: "SAL-000007",
      total: 1_000_00n,
      profit: 0n,
      createdByName: "Cashier",
    });
    expect(text).toBe("🧾 Sale SAL-000007\nBy: Cashier · Total: 1,000 MMK · Profit: 0 MMK");
  });
});

describe("itemLines", () => {
  it("counts the tail of a long basket rather than listing all of it", () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ name: `Item ${i + 1}`, quantity: 1 }));
    const text = itemLines(items);
    expect(text).toContain("• Item 8 × 1");
    expect(text).not.toContain("• Item 9 × 1");
    expect(text).toContain("…and 3 more");
  });
});

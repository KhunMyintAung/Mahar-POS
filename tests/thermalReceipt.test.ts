import { describe, expect, it } from "vitest";
import { buildTextReceipt, centre, row, wrap, WIDTH_58MM } from "@/lib/thermalReceipt";
import type { ReceiptData } from "@/components/SaleReceipt";

/** A thermal printer lays out nothing for us: every line is exactly as wide as we count
 *  it. So the counting is what these tests are about. */

const sale: ReceiptData = {
  txnNo: "SAL-000012",
  at: "2026-08-13T07:20:00.000Z",
  shopName: "Mahar Shwe Mobile",
  shopPhone: "09-123456789",
  customerName: undefined,
  cashierName: "Cashier",
  lines: [
    { name: "Coca Cola 330ml", quantity: 2, unitPrice: 800 },
    { name: "Rice 5kg", quantity: 1, unitPrice: 14000 },
  ],
  subtotal: 15600,
  discount: 0,
  total: 15600,
  paid: 20000,
  change: 4400,
  credit: 0,
};

describe("row", () => {
  it("puts the amount hard against the right edge", () => {
    const line = row("Subtotal", "15,600");
    expect(line).toHaveLength(WIDTH_58MM);
    expect(line.endsWith("15,600")).toBe(true);
    expect(line.startsWith("Subtotal")).toBe(true);
  });

  it("shortens the name rather than the amount when they collide", () => {
    const line = row("A very long product name indeed", "1,234,567");
    expect(line).toHaveLength(WIDTH_58MM);
    // The number is what must survive intact: a price missing a digit is a wrong price.
    expect(line.endsWith("1,234,567")).toBe(true);
  });
});

describe("wrap", () => {
  it("breaks a long name across lines, none wider than the roll", () => {
    const lines = wrap("Samsung Galaxy A54 Tempered Glass Screen Protector", WIDTH_58MM);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(WIDTH_58MM);
    expect(lines.join(" ")).toBe("Samsung Galaxy A54 Tempered Glass Screen Protector");
  });

  it("cuts a single word that cannot fit at all", () => {
    expect(wrap("A".repeat(40), WIDTH_58MM)).toEqual(["A".repeat(32)]);
  });
});

describe("centre", () => {
  it("never runs past the roll", () => {
    expect(centre("Mahar Shwe Mobile").length).toBeLessThanOrEqual(WIDTH_58MM);
    expect(centre("X".repeat(40))).toHaveLength(WIDTH_58MM);
  });
});

describe("buildTextReceipt", () => {
  const text = buildTextReceipt(sale);
  const lines = text.split("\n");

  it("names every item with its quantity and price", () => {
    expect(text).toContain("Coca Cola 330ml");
    expect(lines.some((l) => l.includes("2 x 800") && l.trim().endsWith("1,600"))).toBe(true);
    expect(text).toContain("Rice 5kg");
    expect(lines.some((l) => l.includes("1 x 14,000") && l.trim().endsWith("14,000"))).toBe(true);
  });

  it("carries the totals a customer checks", () => {
    expect(lines.some((l) => l.startsWith("TOTAL") && l.endsWith("15,600"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Paid") && l.endsWith("20,000"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Change") && l.endsWith("4,400"))).toBe(true);
  });

  it("leaves out what did not happen", () => {
    expect(text).not.toContain("Discount");
    expect(text).not.toContain("Owing");
    expect(text).not.toContain("Customer:");
  });

  it("keeps every line inside the roll", () => {
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(WIDTH_58MM);
  });

  it("feeds past the tear-off edge at the end", () => {
    expect(lines.slice(-3).every((l) => l === "")).toBe(true);
  });

  it("shows what is still owed on a credit sale", () => {
    const credit = buildTextReceipt({ ...sale, paid: 5000, change: 0, credit: 10600 });
    expect(credit).toContain("Owing");
    expect(credit.split("\n").some((l) => l.endsWith("10,600"))).toBe(true);
  });
});

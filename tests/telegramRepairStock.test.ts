import { describe, expect, it } from "vitest";
import { repairNewNotice, repairStatusNotice, stockMoveNotice } from "../src/lib/telegramNotify";

describe("repair and stock alerts", () => {
  it("names a new repair, its device, charge and deposit", () => {
    const text = repairNewNotice({
      jobNo: "MS1213", deviceBrand: "iPhone", deviceModel: "12 Pro Max", problem: "Screen cracked",
      customerName: "Ko Aung", estimatedCost: 150_000_00n, depositAmount: 50_000_00n, createdByName: "Khun",
    });
    expect(text).toContain("New repair MS1213");
    expect(text).toContain("iPhone 12 Pro Max — Screen cracked");
    expect(text).toContain("Estimate: 150,000 MMK · Deposit: 50,000 MMK");
  });

  it("shows a status change as from → to, with what was paid", () => {
    const text = repairStatusNotice({
      jobNo: "MS1213", deviceBrand: "iPhone", deviceModel: "12", from: "IN_PROGRESS", to: "DONE",
      finalCost: 150_000_00n, paid: 100_000_00n, createdByName: "Khun",
    });
    expect(text).toContain("✅ Repair MS1213");
    expect(text).toContain("In progress → Completed");
    expect(text).toContain("Charge: 150,000 MMK · Paid now: 100,000 MMK");
  });

  it("signs stock in and out", () => {
    expect(stockMoveNotice({ itemName: "LCD Vivo Y28", label: "Used for repair", quantity: -1, qtyAfter: 9, createdByName: "Khun" }))
      .toContain("Stock Used for repair: LCD Vivo Y28 -1\nNow in stock: 9");
    expect(stockMoveNotice({ itemName: "Type-C Cable", label: "Stock in", quantity: 20, qtyAfter: 47, createdByName: "Khun", detail: "new box" }))
      .toContain("+20");
  });
});

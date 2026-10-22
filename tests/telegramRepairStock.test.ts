import { describe, expect, it } from "vitest";
import { repairNewNotice, repairStatusNotice, stockMoveNotice } from "../src/lib/telegramNotify";

const job = {
  jobNo: "MS1215", deviceBrand: "Realme", deviceModel: "C3", problem: "မှန်လဲ",
  customerName: "U Nang", customerPhone: "09 7777 1234", estimatedCost: 79_000_00n, finalCost: null, depositAmount: 0n, paidAmount: 0n,
};

describe("repair and stock alerts", () => {
  it("lists a new repair one detail per line", () => {
    const text = repairNewNotice({ ...job, depositAmount: 20_000_00n, createdByName: "Khun" });
    expect(text).toBe([
      "🆕 Repair MS1215 · New",
      "📱 Realme C3",
      "👤 U Nang · 09 7777 1234",
      "🛠 မှန်လဲ",
      "💰 79,000 Ks · Deposit 20,000 Ks",
      "Status: Taken in",
      "By: Khun",
    ].join("\n"));
  });

  it("names the job, device, customer, problem, amount and the new status", () => {
    const text = repairStatusNotice({ ...job, from: "IN_PROGRESS", to: "DONE", createdByName: "Khun" });
    expect(text).toBe([
      "✅ Repair MS1215 · Completed",
      "📱 Realme C3",
      "👤 U Nang · 09 7777 1234",
      "🛠 မှန်လဲ",
      "💰 79,000 Ks",
      "Status: In progress → Completed",
      "By: Khun",
    ].join("\n"));
  });

  it("shows what is paid and still due", () => {
    const text = repairStatusNotice({ ...job, finalCost: 80_000_00n, paidAmount: 50_000_00n, paidNow: 30_000_00n, from: "DONE", to: "DELIVERED", createdByName: "Khun" });
    expect(text).toContain("📦 Repair MS1215 · Delivered");
    expect(text).toContain("💰 80,000 Ks · Paid 50,000 Ks · Due 30,000 Ks\n💵 Paid now: 30,000 Ks");
  });

  it("signs stock in and out", () => {
    expect(stockMoveNotice({ itemName: "LCD Vivo Y28", label: "Used for repair", quantity: -1, qtyAfter: 9, createdByName: "Khun" }))
      .toContain("Stock Used for repair: LCD Vivo Y28 -1\nNow in stock: 9");
    expect(stockMoveNotice({ itemName: "Type-C Cable", label: "Stock in", quantity: 20, qtyAfter: 47, createdByName: "Khun", detail: "new box" }))
      .toContain("+20");
  });
});

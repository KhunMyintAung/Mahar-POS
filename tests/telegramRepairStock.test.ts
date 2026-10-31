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
      "🆕 ပြင်ဆင်မှု MS1215 · အသစ်",
      "📱 Realme C3",
      "👤 U Nang · 09 7777 1234",
      "🛠 မှန်လဲ",
      "💰 79,000 Ks · စရံ 20,000 Ks",
      "အခြေအနေ: လက်ခံပြီး",
      "လုပ်သူ: Khun",
    ].join("\n"));
  });

  it("names the job, device, customer, problem, amount and the new status", () => {
    const text = repairStatusNotice({ ...job, from: "IN_PROGRESS", to: "DONE", createdByName: "Khun" });
    expect(text).toBe([
      "✅ ပြင်ဆင်မှု MS1215 · ပြင်ပြီး",
      "📱 Realme C3",
      "👤 U Nang · 09 7777 1234",
      "🛠 မှန်လဲ",
      "💰 79,000 Ks",
      "အခြေအနေ: ပြင်ဆင်နေဆဲ → ပြင်ပြီး",
      "လုပ်သူ: Khun",
    ].join("\n"));
  });

  it("shows what is paid and still due", () => {
    const text = repairStatusNotice({ ...job, finalCost: 80_000_00n, paidAmount: 50_000_00n, paidNow: 30_000_00n, from: "DONE", to: "DELIVERED", createdByName: "Khun" });
    expect(text).toContain("📦 ပြင်ဆင်မှု MS1215 · ပြန်ပေးပြီး");
    expect(text).toContain("💰 80,000 Ks · ပေးပြီး 50,000 Ks · ကျန် 30,000 Ks\n💵 ယခုပေး: 30,000 Ks");
  });

  it("signs stock in and out", () => {
    expect(stockMoveNotice({ itemName: "LCD Vivo Y28", label: "Used for repair", quantity: -1, qtyAfter: 9, createdByName: "Khun" }))
      .toContain("ပြင်ဆင်မှုတွင် သုံး: LCD Vivo Y28 -1\nလက်ကျန်: 9");
    expect(stockMoveNotice({ itemName: "Type-C Cable", label: "Stock in", quantity: 20, qtyAfter: 47, createdByName: "Khun", detail: "new box" }))
      .toContain("+20");
  });
});

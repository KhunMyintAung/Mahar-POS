import { describe, expect, it } from "vitest";
import {
  billerNotice, creditPayableNotice, forShop, incomeExpenseNotice, moneyServiceNotice, newCreditNotice,
  onlineOrderNotice, repairNewNotice, repairStatusNotice, reversalNotice, saleNotice, stockMoveNotice, transferNotice,
} from "@/lib/telegramNotify";
import { REPAIR_STATUSES } from "@/lib/repairStatus";
import { STOCK_REASONS } from "@/lib/stockReasons";

const MYANMAR = /[က-႟]/;
const job = {
  jobNo: "TT0001", deviceBrand: "Samsung", deviceModel: "A15", problem: "Screen", customerName: "Somchai", customerPhone: "081",
  estimatedCost: 1500_00n, finalCost: 1500_00n, depositAmount: 500_00n, paidAmount: 500_00n,
};

/** One of every notice the app sends, with every optional part filled in. */
const notices: string[] = [
  saleNotice({ txnNo: "S1", total: 100_00n, profit: 20_00n, createdByName: "A", notes: "n", items: Array.from({ length: 10 }, (_, i) => ({ name: `Item ${i}`, quantity: 1 })) }),
  ...["TOPUP", "SALE", "ADJUST"].map((kind) => billerNotice({ txnNo: "B1", kind, billerName: "AIS", faceAmount: 1n, cashAmount: 1n, profit: 1n, balanceAfter: 1n, createdByName: "A" })),
  ...["TRANSFER", "CASHOUT"].map((kind) => moneyServiceNotice({ kind, txnNo: "M1", accountName: "PromptPay", cashName: "Cash", amount: 1n, fee: 1n, customer: "C", createdByName: "A" })),
  transferNotice({ txnNo: "T1", sourceName: "Cash", destName: "Bank", sourceAmount: 1n, sourceCurrency: "THB", destAmount: 1n, destCurrency: "THB", createdByName: "A", notes: "n" }),
  ...["INCOME", "WITHDRAW", "EXPENSE"].map((type) => incomeExpenseNotice({ txnNo: "I1", type, categoryName: "Rent", amount: 1n, currency: "THB", createdByName: "A", description: "d" })),
  creditPayableNotice({ kind: "credit", txnNo: "C1", partyName: "P", amount: 1n, currency: "THB", createdByName: "A" }),
  creditPayableNotice({ kind: "payable", txnNo: "C1", partyName: "P", amount: 1n, currency: "THB", createdByName: "A" }),
  newCreditNotice({ txnNo: "N1", customerName: "P", amount: 1n, currency: "THB", createdByName: "A", notes: "n" }),
  // The labels the reverse and void routes pass in.
  ...["ဝင်ငွေ", "ထွက်ငွေ", "ငွေထုတ်", "ငွေလွဲပေး", "ငွေထုတ်ပေး", "ငွေလွှဲ"].map((label) => reversalNotice({ icon: "x", label, txnNo: "R1", reason: "r", createdByName: "A" })),
  repairNewNotice({ ...job, createdByName: "A" }),
  ...REPAIR_STATUSES.flatMap((from) => REPAIR_STATUSES.map((to) => repairStatusNotice({ ...job, from, to, paidAmount: 500_00n, paidNow: 100_00n, createdByName: "A", notes: "n" }))),
  ...[...STOCK_REASONS.map((r) => r.label), "Stock in", "Adjustment"].map((label) => stockMoveNotice({ itemName: "LCD", label, quantity: -1, qtyAfter: 9, createdByName: "A", detail: "d" })),
  onlineOrderNotice({ orderNo: "O1", customerName: "C", customerPhone: "081", address: "Bangkok", note: "n", lines: [{ name: "Case", quantity: 2, unitPrice: 50_00n }], total: 100_00n }),
];

describe("Telegram notices in the shop's language", () => {
  it("leaves a Myanmar shop's notices exactly as written", () => {
    const raw = repairNewNotice({ ...job, createdByName: "A" });
    expect(forShop(raw, "MMK")).toBe(raw);
    expect(forShop(raw, "MMK")).toContain("1,500 Ks");
  });

  it("has no Myanmar left in any notice for a THB or USD shop", () => {
    for (const currency of ["THB", "USD"]) {
      for (const raw of notices) {
        const text = forShop(raw, currency);
        expect(text, `${currency}: ${text}`).not.toMatch(MYANMAR);
      }
    }
  });

  it("writes a Thai shop's repair notice in Thai and baht", () => {
    const text = forShop(repairStatusNotice({ ...job, from: "IN_PROGRESS", to: "DONE", createdByName: "A" }), "THB");
    expect(text).toContain("งานซ่อม TT0001 · ซ่อมเสร็จแล้ว");
    expect(text).toContain("สถานะ: กำลังซ่อม → ซ่อมเสร็จแล้ว");
    expect(text).toContain("1,500 THB");
    expect(text).not.toContain("Ks");
  });

  it("writes a USD shop's sale in English", () => {
    const text = forShop(saleNotice({ txnNo: "S1", total: 100_00n, profit: 20_00n, createdByName: "A" }), "USD");
    expect(text).toBe("🧾 Sale S1\nBy: A · Total: 100 USD · Profit: 20 USD");
  });
});

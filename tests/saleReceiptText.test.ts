import { describe, expect, it } from "vitest";
import { receiptHasOwnLanguage, receiptText } from "@/lib/saleReceiptText";

describe("sale receipt wording", () => {
  it("is Thai for a THB shop and English otherwise", () => {
    expect(receiptText("THB").title).toMatch(/[฀-๿]/);
    expect(receiptText("USD").title).toBe("Sale Receipt");
    // An MMK shop's receipt has always printed in English; that does not change.
    expect(receiptText("MMK").title).toBe("Sale Receipt");
    expect(receiptText(undefined).title).toBe("Sale Receipt");
  });

  it("has every label in Thai, none left empty or in Myanmar", () => {
    const en = receiptText("USD");
    const th = receiptText("THB");
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(th)) {
      expect(value).toBeTruthy();
      expect(value).not.toMatch(/[က-႟]/);
    }
  });

  it("keeps a Thai or English shop's receipt out of the screen's language pass", () => {
    expect(receiptHasOwnLanguage("THB")).toBe(true);
    expect(receiptHasOwnLanguage("USD")).toBe(true);
    expect(receiptHasOwnLanguage("MMK")).toBe(false);
  });
});

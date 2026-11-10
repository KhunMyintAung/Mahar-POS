import { describe, expect, it } from "vitest";
import { asCurrency, CURRENCIES, inCurrency, isCurrency } from "@/lib/currency";

describe("shop currency", () => {
  it("knows the three currencies a shop can keep its books in", () => {
    expect([...CURRENCIES]).toEqual(["MMK", "USD", "THB"]);
    expect(isCurrency("USD")).toBe(true);
    expect(isCurrency("EUR")).toBe(false);
    expect(isCurrency(undefined)).toBe(false);
  });

  it("reads anything unknown as MMK", () => {
    expect(asCurrency("THB")).toBe("THB");
    expect(asCurrency("usd")).toBe("MMK");
    expect(asCurrency(null)).toBe("MMK");
  });

  it("shows MMK labels in the shop's currency, the code as a word only", () => {
    expect(inCurrency("Total MMK Balance", "USD")).toBe("Total USD Balance");
    expect(inCurrency("Charge (MMK)", "THB")).toBe("Charge (THB)");
    expect(inCurrency("1,500 MMK", "MMK")).toBe("1,500 MMK");
    expect(inCurrency("MMKX code", "USD")).toBe("MMKX code");
  });
});

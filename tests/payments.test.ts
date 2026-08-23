import { describe, expect, it } from "vitest";
import { activePaymentMethods, parsePaymentMethods, paymentInstructionsMy } from "@/lib/payments";

describe("payment methods", () => {
  it("reads a normal document", () => {
    const methods = parsePaymentMethods({
      methods: [{ id: "a", type: "KPAY", accountName: "Ko Ko", accountNumber: "09777000111", active: true }],
    });
    expect(methods).toHaveLength(1);
    expect(methods[0].type).toBe("KPAY");
  });

  it("drops an entry a customer could not pay to", () => {
    // No account number means the customer is shown a method they cannot use.
    const methods = parsePaymentMethods({
      methods: [
        { type: "KPAY", accountNumber: "", accountName: "Ko Ko" },
        { type: "NOT_A_WALLET", accountNumber: "123" },
        { type: "WAVE", accountNumber: "09400111222" },
      ],
    });
    expect(methods.map((m) => m.type)).toEqual(["WAVE"]);
  });

  it("keeps cash, which has no account number", () => {
    const methods = parsePaymentMethods({ methods: [{ type: "CASH", accountName: "Shop" }] });
    expect(methods).toHaveLength(1);
  });

  it("survives anything that is not a document", () => {
    for (const bad of [null, undefined, 5, "x", {}, { methods: "no" }, { methods: [null, 1] }]) {
      expect(parsePaymentMethods(bad)).toEqual([]);
    }
  });

  it("hides methods switched off, so a closed account is not advertised", () => {
    const doc = {
      methods: [
        { type: "KPAY", accountNumber: "1", active: false },
        { type: "WAVE", accountNumber: "2", active: true },
      ],
    };
    expect(parsePaymentMethods(doc)).toHaveLength(2);
    expect(activePaymentMethods(doc).map((m) => m.type)).toEqual(["WAVE"]);
  });

  it("writes instructions in Myanmar with the number the customer must send to", () => {
    const text = paymentInstructionsMy(
      parsePaymentMethods({ methods: [{ type: "KPAY", accountNumber: "09777000111", accountName: "Ko Ko" }] })
    );
    expect(text).toContain("09777000111");
    expect(text).toContain("နံပါတ်");
    expect(text).not.toMatch(/[Nn]umber —/);
  });
});

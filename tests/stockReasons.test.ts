import { describe, expect, it } from "vitest";
import { MOVEMENT_LABELS, signedQuantity } from "@/lib/stockReasons";

describe("stock reasons", () => {
  it("takes stock out for use, damage and returns to the supplier, whatever sign was typed", () => {
    expect(signedQuantity("REPAIR_USE", 2)).toBe(-2);
    expect(signedQuantity("DAMAGE", -1)).toBe(-1);
    expect(signedQuantity("RETURN_OUT", 3)).toBe(-3);
  });

  it("puts returned stock back", () => {
    expect(signedQuantity("RETURN_IN", -4)).toBe(4);
  });

  it("lets a correction go either way", () => {
    expect(signedQuantity("CORRECTION", 5)).toBe(5);
    expect(signedQuantity("CORRECTION", -5)).toBe(-5);
  });

  it("names every movement type", () => {
    expect(MOVEMENT_LABELS.REPAIR_USE).toBe("Used for repair");
    expect(MOVEMENT_LABELS.SALE).toBe("Sale");
  });
});

import { describe, it, expect } from "vitest";
import { computeTotals } from "../src/services/posService";

describe("POS totals", () => {
  it("sums line totals and applies discount", () => {
    const r = computeTotals(
      [
        { quantity: 2, unitPrice: 70_000n },  // 2 × 700
        { quantity: 1, unitPrice: 120_000n }, // 1 × 1,200
      ],
      10_000n // 100 discount
    );
    expect(r.subtotal).toBe(260_000n);
    expect(r.total).toBe(250_000n);
  });

  it("rejects zero or negative quantity", () => {
    expect(() => computeTotals([{ quantity: 0, unitPrice: 100n }], 0n)).toThrow();
    expect(() => computeTotals([{ quantity: -1, unitPrice: 100n }], 0n)).toThrow();
  });

  it("rejects negative price", () => {
    expect(() => computeTotals([{ quantity: 1, unitPrice: -1n }], 0n)).toThrow();
  });

  it("rejects discount larger than subtotal", () => {
    expect(() => computeTotals([{ quantity: 1, unitPrice: 100n }], 200n)).toThrow();
    expect(() => computeTotals([{ quantity: 1, unitPrice: 100n }], -1n)).toThrow();
  });

  it("profit math: revenue minus cost", () => {
    // selling 3 units at 700 that cost 500 → profit 600
    const revenue = 3n * 70_000n;
    const cost = 3n * 50_000n;
    expect(revenue - cost).toBe(60_000n);
  });
});

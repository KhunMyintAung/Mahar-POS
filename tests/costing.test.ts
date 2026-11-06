import { describe, expect, it } from "vitest";
import { averageCost } from "@/lib/costing";

describe("averageCost", () => {
  it("pools stock on hand with what came in", () => {
    expect(averageCost(5, 300000n, 10, 350000n)).toBe(333333n);
  });
  it("takes the new price when nothing is on hand", () => {
    expect(averageCost(0, 300000n, 10, 350000n)).toBe(350000n);
    expect(averageCost(-2, 300000n, 10, 350000n)).toBe(350000n);
  });
  it("takes the new price when the old cost was never set", () => {
    expect(averageCost(5, 0n, 10, 350000n)).toBe(350000n);
  });
  it("lets a free delivery bring the average down, but not to zero from an empty shelf", () => {
    expect(averageCost(10, 300000n, 10, 0n)).toBe(150000n);
    expect(averageCost(0, 300000n, 10, 0n)).toBe(300000n);
  });
  it("rounds to the nearest minor unit", () => {
    expect(averageCost(1, 100n, 2, 101n)).toBe(101n); // 302 / 3 = 100.67
    expect(averageCost(2, 100n, 1, 101n)).toBe(100n); // 301 / 3 = 100.33
  });
});

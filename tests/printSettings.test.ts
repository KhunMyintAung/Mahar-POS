import { describe, expect, it } from "vitest";
import { printableMm, slipZoom } from "@/lib/printSettings";

describe("receipt paper", () => {
  it("prints a 58mm slip as it is on 58mm paper", () => {
    expect(slipZoom(58, false)).toBe(1);
    expect(printableMm(58, true)).toBe(58);
  });

  it("fills exactly 80mm on 80mm paper", () => {
    expect(printableMm(80, false)).toBe(80);
    expect(slipZoom(80, false) * 58).toBeCloseTo(80);
  });

  it("shrinks to 72mm when the printer cuts the edges", () => {
    expect(printableMm(80, true)).toBe(72);
  });
});

import { describe, expect, it } from "vitest";
import { printableMm, slipZoom } from "@/lib/printSettings";

describe("receipt paper", () => {
  it("prints a 58mm slip as it is on 58mm paper", () => {
    expect(slipZoom(58)).toBe(1);
    expect(printableMm(58)).toBe(58);
  });

  it("scales the slip to fit inside the 72mm an 80mm printer can reach", () => {
    expect(printableMm(80)).toBe(71);
    expect(slipZoom(80) * 58).toBeLessThan(72);
  });
});

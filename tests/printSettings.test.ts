import { describe, expect, it } from "vitest";
import { pageCss, printableMm, slipZoom } from "@/lib/printSettings";

describe("receipt paper", () => {
  it("prints a 58mm slip as it is on 58mm paper", () => {
    expect(slipZoom(58)).toBe(1);
    expect(pageCss(58)).toBe("@page{margin:0}");
  });

  it("tells the printer the paper is 80mm and fills the space inside 3mm margins", () => {
    expect(pageCss(80)).toBe("@page{size:80mm auto;margin:3mm}");
    expect(printableMm(80)).toBe(74);
    expect(slipZoom(80) * 58).toBeCloseTo(74);
  });
});

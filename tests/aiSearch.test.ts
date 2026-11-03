import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { closeMatches, likeness, searchWords } from "@/lib/aiTools";

describe("AI stock search", () => {
  it("looks for each word on its own", () => {
    expect(searchWords("spear Part")).toEqual(["spear", "part"]);
    expect(searchWords("  LCD / iPhone-13 ")).toEqual(["lcd", "iphone", "13"]);
  });

  it("forgives a typo or swapped letters", () => {
    expect(likeness("spear", "spare")).toBeGreaterThanOrEqual(0.5);
    expect(likeness("charger", "charger")).toBe(1);
    expect(likeness("lcd", "battery")).toBeLessThan(0.2);
  });

  it("offers the closest items when nothing holds the words", () => {
    const items = [
      { name: "Spare Part Speaker", extra: "" },
      { name: "Battery iPhone 11", extra: "Battery" },
      { name: "Charger 20W", extra: "" },
    ];
    expect(closeMatches(items, searchWords("spear prt")).map((i) => i.name)).toEqual(["Spare Part Speaker"]);
    expect(closeMatches(items, searchWords("batery")).map((i) => i.name)).toEqual(["Battery iPhone 11"]);
  });
});

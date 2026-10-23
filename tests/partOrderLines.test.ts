import { describe, expect, it } from "vitest";
import { parseLines } from "@/lib/partOrderLines";

describe("order list paste", () => {
  it("reads the shop's own supplier list, one part and its count per line", () => {
    const list = [
      "Vivo Y17s TL 3",
      "Vivo Y50 TL 1",
      "Vivo Y11 Battery 1",
      "Vivo Y33 5G",
      "Infinx Smart 9 TL 3",
      "",
      "Double Tape Small 1",
      "Redmi Note 12 5G TFT China 1",
    ].join("\n");
    expect(parseLines(list)).toEqual([
      { item: "Vivo Y17s TL", quantity: 3 },
      { item: "Vivo Y50 TL", quantity: 1 },
      { item: "Vivo Y11 Battery", quantity: 1 },
      // "5G" is part of the name, not a count.
      { item: "Vivo Y33 5G", quantity: 1 },
      { item: "Infinx Smart 9 TL", quantity: 3 },
      { item: "Double Tape Small", quantity: 1 },
      { item: "Redmi Note 12 5G TFT China", quantity: 1 },
    ]);
  });

  it("takes x3, ×3 and pcs, and keeps a line with no count whole", () => {
    expect(parseLines("Oppo A3X TL x3\nBattery ×2\nGlass 5 pcs\nBack cover")).toEqual([
      { item: "Oppo A3X TL", quantity: 3 },
      { item: "Battery", quantity: 2 },
      { item: "Glass", quantity: 5 },
      { item: "Back cover", quantity: 1 },
    ]);
  });
});

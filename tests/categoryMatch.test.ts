import { describe, expect, it } from "vitest";
import { matchCategory, normalizeCategory } from "@/lib/categoryMatch";

const cats = [
  { id: "acc", name: "Accessory", parentId: null },
  { id: "ph", name: "Phone", parentId: null },
  { id: "case", name: "Case", parentId: "acc" },
  { id: "cake", name: "Cake", parentId: null },
  { id: "ear", name: "Earphone", parentId: "acc" },
  { id: "sp", name: "Spare Parts", parentId: null },
  { id: "mm", name: "ဖုန်းအသစ်", parentId: null },
];
const id = (name: string) => matchCategory(name, cats)?.id ?? null;

describe("matching an import's category to the shop's own", () => {
  it("ignores case, spaces, punctuation and plurals", () => {
    expect(normalizeCategory(" Accessories ")).toBe("accessory");
    expect(id("ACCESSORY")).toBe("acc");
    expect(id("accessories")).toBe("acc");
    expect(id("Ear phone")).toBe("ear");
    expect(id("spare-part")).toBe("sp");
    expect(id("Phones")).toBe("ph");
  });

  it("forgives a slipped letter in a longer name", () => {
    expect(id("Accesory")).toBe("acc");
    expect(id("Acessories")).toBe("acc");
    expect(id("Earphne")).toBe("ear");
    expect(id("Phine")).toBe("ph");
  });

  it("keeps short names that differ apart", () => {
    expect(id("Cases")).toBe("case");
    expect(id("Cabe")).toBeNull();
    expect(id("Glass")).toBeNull();
  });

  it("matches Myanmar names exactly and makes nothing up", () => {
    expect(id("ဖုန်းအသစ်")).toBe("mm");
    expect(id("Drinks")).toBeNull();
    expect(id("")).toBeNull();
  });
});

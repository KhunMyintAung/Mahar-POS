import { describe, expect, it } from "vitest";
import { categoryChoices, categoryPath, inCategoryChoice } from "@/lib/categoryChoice";

const earphone = { category: { name: "Earphone", parentName: "Accessory" } };
const glass = { category: { name: "Glass", parentName: "Accessory" } };
const mainOnly = { category: { name: "Accessory", parentName: null } };
const lcd = { category: { name: "LCD", parentName: "Spare Part" } };
const accessoryKit = { category: { name: "Accessory Kit" } };
const none = {};

describe("category choice at the till", () => {
  it("writes a sub-category with its main category", () => {
    expect(categoryPath(earphone)).toBe("Accessory › Earphone");
    expect(categoryPath(mainOnly)).toBe("Accessory");
    expect(categoryPath(none)).toBe("");
  });

  it("offers each main category even when no item sits directly in it", () => {
    expect(categoryChoices([glass, earphone, lcd, none])).toEqual([
      "Accessory",
      "Accessory › Earphone",
      "Accessory › Glass",
      "Spare Part",
      "Spare Part › LCD",
    ]);
  });

  it("takes in every sub-category when the main one is picked", () => {
    const all = [earphone, glass, mainOnly, lcd, accessoryKit, none];
    expect(all.filter((i) => inCategoryChoice(i, "Accessory"))).toEqual([earphone, glass, mainOnly]);
  });

  it("takes in only that one when a sub-category is picked", () => {
    expect([earphone, glass, mainOnly].filter((i) => inCategoryChoice(i, "Accessory › Earphone"))).toEqual([earphone]);
  });

  it("takes in everything for All", () => {
    expect([earphone, lcd, none].every((i) => inCategoryChoice(i, "ALL"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { matchesWords } from "@/lib/searchWords";

const lcd = "Oppo A15/A16k/Realme C12/C15/C11 Single Flex";

describe("search word by word", () => {
  it("finds a part named for several phones by any one of them", () => {
    expect(matchesWords("realme c15", lcd)).toBe(true);
    expect(matchesWords("oppo a16k", lcd)).toBe(true);
    expect(matchesWords("C11 realme", lcd)).toBe(true);
  });
  it("needs every word", () => {
    expect(matchesWords("realme c20", lcd)).toBe(false);
  });
  it("looks across the texts given, and an empty search finds everything", () => {
    expect(matchesWords("lcd-0012 realme", lcd, "LCD-0012")).toBe(true);
    expect(matchesWords("  ", lcd)).toBe(true);
  });
});

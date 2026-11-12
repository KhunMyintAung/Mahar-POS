import { describe, expect, it } from "vitest";
import { matchesWords, wordForms } from "@/lib/searchWords";

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

describe("model numbers typed without their space", () => {
  const note = "Redmi Note 9 5G";
  it("finds Note 9 by note9, and not another Note", () => {
    expect(matchesWords("note9", note)).toBe(true);
    expect(matchesWords("redmi note9", "Redmi Note 9 G")).toBe(true);
    expect(matchesWords("note9", "Redmi Note 10 Pro")).toBe(false);
    expect(matchesWords("note 9", note)).toBe(true);
  });
  it("gives the database the spaced forms to look for", () => {
    expect(wordForms("note9")).toEqual(["note9", "note 9", "note-9", "note.9"]);
    expect(wordForms("a16k")).toContain("a 16 k");
    expect(wordForms("lcd")).toEqual(["lcd"]);
  });
});

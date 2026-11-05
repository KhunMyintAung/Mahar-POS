import { describe, expect, it } from "vitest";
import { cardsTotal, parseCards, tallyCards } from "@/lib/billerCards";

describe("top-up cards sold", () => {
  it("adds up the cards and reads only good counts", () => {
    expect(cardsTotal({ "1000": 2, "5000": 1 })).toBe(7000n);
    expect(parseCards('{"1000":2,"x":3,"5000":0}')).toEqual({ "1000": 2 });
    expect(parseCards("not json")).toBeNull();
    expect(parseCards(null)).toBeNull();
  });
  it("counts the day's cards per biller, typed sales apart", () => {
    const t = tallyCards([
      { billerId: "m", billerName: "Mytel", cards: { "1000": 2 }, faceAmount: 200000n },
      { billerId: "m", billerName: "Mytel", cards: { "1000": 1, "5000": 1 }, faceAmount: 600000n },
      { billerId: "m", billerName: "Mytel", cards: null, faceAmount: 300000n },
      { billerId: "a", billerName: "ATOM", cards: { "10000": 1 }, faceAmount: 1000000n },
    ]);
    expect(t).toEqual([
      { billerId: "a", billerName: "ATOM", cards: [{ amount: 10000, count: 1 }], typed: "0", total: "1000000" },
      { billerId: "m", billerName: "Mytel", cards: [{ amount: 1000, count: 3 }, { amount: 5000, count: 1 }], typed: "300000", total: "1100000" },
    ]);
  });
});

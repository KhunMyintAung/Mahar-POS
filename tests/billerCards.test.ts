import { describe, expect, it } from "vitest";
import { cardReport, cardsOnHand, cardsTotal, parseCards, tallyCards } from "@/lib/billerCards";

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

describe("cards on hand", () => {
  const at = (iso: string) => new Date(iso);
  it("starts from the last count and follows cards bought and sold after it", () => {
    const left = cardsOnHand({ counts: { "5000": 3, "3000": 1 }, at: "2026-11-05T05:00:00.000Z" }, [
      { kind: "SALE", cards: { "5000": 9 }, createdAt: at("2026-11-05T04:00:00Z") }, // before the count
      { kind: "SALE", cards: { "5000": 1 }, createdAt: at("2026-11-05T06:00:00Z") },
      { kind: "TOPUP", cards: { "1000": 10 }, createdAt: at("2026-11-05T07:00:00Z") },
      { kind: "SALE", cards: { "3000": 1, "1000": 2 }, createdAt: at("2026-11-05T08:00:00Z") },
      { kind: "SALE", cards: null, createdAt: at("2026-11-05T09:00:00Z") },
    ]);
    expect(left).toEqual({ "5000": 2, "1000": 8 });
  });
  it("with no count, counts every card movement", () => {
    expect(cardsOnHand(null, [{ kind: "SALE", cards: { "1000": 2 }, createdAt: at("2026-11-05T06:00:00Z") }])).toEqual({ "1000": -2 });
  });
});

describe('card report', () => {
  it('opening, bought, sold and left for the day, margin shared by value', () => {
    const d = (h: string) => new Date('2026-11-05T' + h + ':00Z');
    const rows = cardReport({
      billerId: 'b', billerName: 'MPT', count: { counts: { '5000': 3 }, at: '2026-11-04T01:00:00.000Z' },
      movements: [
        { kind: 'SALE', cards: { '5000': 1 }, createdAt: new Date('2026-11-04T05:00:00Z'), faceAmount: 500000n, profit: 0n },
        { kind: 'TOPUP', cards: { '1000': 10 }, createdAt: d('03'), faceAmount: 1000000n, profit: 0n },
        { kind: 'SALE', cards: { '5000': 1, '1000': 5 }, createdAt: d('04'), faceAmount: 1000000n, profit: 30000n },
      ],
      dayStart: d('00'), dayEnd: new Date('2026-11-06T00:00:00Z'),
    });
    expect(rows).toEqual([
      { billerId: 'b', billerName: 'MPT', amount: 1000, opening: 0, bought: 10, sold: 5, closing: 5, sales: '500000', profit: '15000' },
      { billerId: 'b', billerName: 'MPT', amount: 5000, opening: 2, bought: 0, sold: 1, closing: 1, sales: '500000', profit: '15000' },
    ]);
  });
});

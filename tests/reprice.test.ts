import { describe, expect, it } from "vitest";
import { repriced, validRule, type RepriceRule } from "@/lib/reprice";

const k = (kyat: number) => BigInt(kyat) * 100n;
const rule = (r: Partial<RepriceRule>): RepriceRule => ({ mode: "set", value: 0, direction: "up", roundTo: 0, ...r });

describe("bulk reprice", () => {
  it("sets one price for all", () => {
    expect(repriced(k(9000), rule({ mode: "set", value: 8500 }))).toBe(k(8500));
  });

  it("raises or discounts by a percentage", () => {
    expect(repriced(k(10000), rule({ mode: "percent", value: 10, direction: "up" }))).toBe(k(11000));
    expect(repriced(k(10000), rule({ mode: "percent", value: 15, direction: "down" }))).toBe(k(8500));
  });

  it("raises or discounts by an amount", () => {
    expect(repriced(k(3000), rule({ mode: "amount", value: 500, direction: "up" }))).toBe(k(3500));
    expect(repriced(k(3000), rule({ mode: "amount", value: 500, direction: "down" }))).toBe(k(2500));
  });

  it("rounds to a tidy price", () => {
    expect(repriced(k(465000), rule({ mode: "percent", value: 7, direction: "down", roundTo: 1000 }))).toBe(k(432000));
    expect(repriced(k(2000), rule({ mode: "percent", value: 12, direction: "up", roundTo: 50 }))).toBe(k(2250));
  });

  it("never goes below zero", () => {
    expect(repriced(k(300), rule({ mode: "amount", value: 500, direction: "down" }))).toBe(0n);
  });

  it("refuses nonsense", () => {
    expect(validRule(rule({ value: -1 }))).not.toBeNull();
    expect(validRule(rule({ mode: "percent", value: 120, direction: "down" }))).not.toBeNull();
    expect(validRule(rule({ mode: "percent", value: 20, direction: "down" }))).toBeNull();
  });
});

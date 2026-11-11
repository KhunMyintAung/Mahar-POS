import { afterEach, describe, expect, it } from "vitest";
import { businessDateOf, dateRangeUtc, monthRangeUtc, setZoneResolver, shopZone, zoneOffsetMinutes } from "@/lib/dates";
import { businessNoon } from "@/lib/backdate";

/** Runs with the shop's zone set, as a request for that shop does. */
function inZone<T>(zone: string | undefined, fn: () => T): T {
  setZoneResolver(() => zone);
  try { return fn(); } finally { setZoneResolver(() => undefined); }
}

afterEach(() => setZoneResolver(() => undefined));

describe("the shop's own time zone", () => {
  it("is Asia/Yangon where no shop is known, as it always was", () => {
    expect(shopZone()).toBe("Asia/Yangon");
    // The same instants as the fixed +06:30 the app used before.
    expect(dateRangeUtc("2026-11-11")).toEqual({ gte: new Date("2026-11-10T17:30:00Z"), lt: new Date("2026-11-11T17:30:00Z") });
    expect(monthRangeUtc("2026-12")).toEqual({ gte: new Date("2026-11-30T17:30:00Z"), lt: new Date("2026-12-31T17:30:00Z") });
    expect(businessNoon("2026-11-11")).toEqual(new Date("2026-11-11T05:30:00Z"));
    expect(businessDateOf(new Date("2026-11-10T17:29:59Z"))).toBe("2026-11-10");
    expect(businessDateOf(new Date("2026-11-10T17:30:00Z"))).toBe("2026-11-11");
  });

  it("turns a Bangkok shop's day over at Bangkok midnight", () => {
    inZone("Asia/Bangkok", () => {
      expect(dateRangeUtc("2026-11-11")).toEqual({ gte: new Date("2026-11-10T17:00:00Z"), lt: new Date("2026-11-11T17:00:00Z") });
      expect(businessNoon("2026-11-11")).toEqual(new Date("2026-11-11T05:00:00Z"));
      // 00:10 in Bangkok is already the 11th there; in Yangon it is still 23:40 on the 10th.
      const at = new Date("2026-11-10T17:10:00Z");
      expect(businessDateOf(at)).toBe("2026-11-11");
      expect(dateRangeUtc("2026-11-11").gte <= at && at < dateRangeUtc("2026-11-11").lt).toBe(true);
    });
    expect(businessDateOf(new Date("2026-11-10T17:10:00Z"))).toBe("2026-11-10");
  });

  it("puts every moment in the day its date names, in any zone", () => {
    for (const zone of ["Asia/Yangon", "Asia/Bangkok", "UTC", "America/New_York", "Asia/Kolkata"]) {
      inZone(zone, () => {
        for (const iso of ["2026-01-01T00:00:00Z", "2026-03-08T07:30:00Z", "2026-11-01T05:59:59Z", "2026-11-11T23:59:59Z"]) {
          const at = new Date(iso);
          const range = dateRangeUtc(businessDateOf(at));
          expect(range.gte <= at && at < range.lt, `${zone} ${iso}`).toBe(true);
        }
      });
    }
  });

  it("knows how far a zone is ahead of UTC", () => {
    const at = new Date("2026-11-11T00:00:00Z");
    expect(zoneOffsetMinutes("Asia/Yangon", at)).toBe(390);
    expect(zoneOffsetMinutes("Asia/Bangkok", at)).toBe(420);
    expect(zoneOffsetMinutes("UTC", at)).toBe(0);
  });
});

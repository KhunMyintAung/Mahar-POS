import { describe, expect, it } from "vitest";
import { offlineSaleProblem } from "@/lib/offlineSale";

describe("offlineSaleProblem", () => {
  const now = new Date("2026-11-08T10:00:00+06:30");

  it("accepts a sale sent later on the day it was made", () => {
    expect(offlineSaleProblem(new Date("2026-11-07T21:15:00+06:30"), "2026-11-07", now)).toBeNull();
  });

  it("uses the shop's day, not UTC's, for a sale late in the evening", () => {
    // 23:30 in Yangon is still 17:00 UTC on the same day, and 00:30 is the next day.
    expect(offlineSaleProblem(new Date("2026-11-07T23:30:00+06:30"), "2026-11-07", now)).toBeNull();
    expect(offlineSaleProblem(new Date("2026-11-08T00:30:00+06:30"), "2026-11-07", now)).not.toBeNull();
  });

  it("refuses a date that does not match the time", () => {
    expect(offlineSaleProblem(new Date("2026-11-07T12:00:00+06:30"), "2026-11-08", now)).toMatch(/does not match/);
  });

  it("refuses a time still to come, beyond a little clock drift", () => {
    expect(offlineSaleProblem(new Date(now.getTime() + 5 * 60_000), "2026-11-08", now)).toBeNull();
    expect(offlineSaleProblem(new Date(now.getTime() + 60 * 60_000), "2026-11-08", now)).toMatch(/still to come/);
  });

  it("refuses a time that is not a time", () => {
    expect(offlineSaleProblem(new Date("nonsense"), "2026-11-08", now)).toMatch(/not a time/);
  });
});

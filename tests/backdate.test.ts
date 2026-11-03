import { describe, expect, it } from "vitest";
import { businessNoon, otherDayProblem } from "../src/lib/backdate";
import { businessDateOf } from "../src/lib/dates";

describe("recording for another day", () => {
  const today = "2026-11-03";
  it("lets anyone record for today", () => {
    expect(otherDayProblem("Cashier", today, today)).toBeNull();
  });
  it("lets only the owner or an admin record for an earlier day", () => {
    expect(otherDayProblem("Owner", "2026-11-02", today)).toBeNull();
    expect(otherDayProblem("Admin", "2026-11-02", today)).toBeNull();
    expect(otherDayProblem("Cashier", "2026-11-02", today)).toMatch(/owner or an admin/);
  });
  it("refuses a day still to come for everyone", () => {
    expect(otherDayProblem("Owner", "2026-11-04", today)).toMatch(/still to come/);
  });
  it("puts a back-dated record on that day", () => {
    expect(businessDateOf(businessNoon("2026-11-02"))).toBe("2026-11-02");
  });
});

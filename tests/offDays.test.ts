import { describe, expect, it } from "vitest";
import { countDays, dayKind, markOffDay, parseOffDays } from "@/lib/offDays";

describe("off days", () => {
  const active = new Set(["2026-11-01", "2026-11-03"]);

  it("a day with nothing recorded is not an off day until it is marked", () => {
    expect(dayKind("2026-11-02", active, { weekly: [], days: [] })).toBe("none");
    expect(dayKind("2026-11-02", active, { weekly: [], days: ["2026-11-02"] })).toBe("off");
  });

  it("the weekly off day counts as off; worked on, it counts as open", () => {
    // 2026-11-01 is a Sunday with records, 2026-11-08 a Sunday without.
    const cfg = { weekly: [0], days: [] };
    expect(dayKind("2026-11-08", active, cfg)).toBe("off");
    expect(dayKind("2026-11-01", active, cfg)).toBe("open");
  });

  it("counts up to today only", () => {
    const c = countDays("2026-11-01", "2026-11-30", "2026-11-05", active, { weekly: [], days: ["2026-11-04"] });
    expect(c).toMatchObject({ open: 2, off: 1, none: 2, noneDates: ["2026-11-02", "2026-11-05"], offDates: ["2026-11-04"] });
  });

  it("marks and unmarks, and reads only sound values", () => {
    const cfg = markOffDay({ weekly: [], days: [] }, "2026-11-04", true);
    expect(cfg.days).toEqual(["2026-11-04"]);
    expect(markOffDay(cfg, "2026-11-04", false).days).toEqual([]);
    expect(parseOffDays({ weekly: [0, 9, 0, "x"], days: ["2026-11-04", "bad"] })).toEqual({ weekly: [0], days: ["2026-11-04"] });
  });
});

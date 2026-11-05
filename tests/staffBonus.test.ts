import { describe, expect, it } from "vitest";
import { DEPOSIT_MONTHS, attendanceBonusFor } from "@/services/staffService";

describe("no days off bonus", () => {
  it("is given for a month with no day off", () => {
    expect(attendanceBonusFor(2_000_000n, ["PRESENT", "PRESENT"])).toBe(2_000_000n);
    expect(attendanceBonusFor(2_000_000n, [])).toBe(2_000_000n);
  });

  it("is lost for an absence, a half day or leave", () => {
    expect(attendanceBonusFor(2_000_000n, ["PRESENT", "ABSENT"])).toBe(0n);
    expect(attendanceBonusFor(2_000_000n, ["HALF"])).toBe(0n);
    expect(attendanceBonusFor(2_000_000n, ["LEAVE"])).toBe(0n);
  });

  it("keeps the deposit six months", () => {
    expect(DEPOSIT_MONTHS).toBe(6);
  });
});

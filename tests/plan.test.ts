import { describe, expect, it } from "vitest";
import { planOf, isPro, proDaysLeft, trialUntil, TRIAL_DAYS } from "@/lib/plan";

const now = new Date("2026-11-18T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");
const past = new Date("2026-11-01T00:00:00Z");

describe("freemium plan", () => {
  it("is Pro while proUntil is in the future, Free otherwise", () => {
    expect(planOf(future, now)).toBe("PRO");
    expect(planOf(past, now)).toBe("FREE");
    expect(planOf(null, now)).toBe("FREE");
    expect(planOf(undefined, now)).toBe("FREE");
    expect(isPro(future, now)).toBe(true);
    expect(isPro(past, now)).toBe(false);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(planOf("2026-12-01T00:00:00Z", now)).toBe("PRO");
    expect(planOf("2026-11-01T00:00:00Z", now)).toBe("FREE");
  });

  it("counts whole Pro days left, 0 once expired", () => {
    expect(proDaysLeft(future, now)).toBe(13);
    expect(proDaysLeft(past, now)).toBe(0);
    expect(proDaysLeft(null, now)).toBe(0);
  });

  it("gives a new shop a 60-day trial", () => {
    const until = trialUntil(now);
    expect(proDaysLeft(until, now)).toBe(TRIAL_DAYS);
    expect(planOf(until, now)).toBe("PRO");
  });
});

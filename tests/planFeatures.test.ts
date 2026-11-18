import { describe, expect, it } from "vitest";
import { gateProFeatures, PRO_FEATURES, FEATURE_KEYS, type FeatureVisibility } from "@/lib/modules";

const allOn = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureVisibility;

describe("gateProFeatures", () => {
  it("leaves everything on for a Pro shop", () => {
    expect(gateProFeatures(allOn, true)).toEqual(allOn);
  });

  it("turns the Pro-only features off for a Free shop, keeps the core on", () => {
    const g = gateProFeatures(allOn, false);
    for (const k of PRO_FEATURES) expect(g[k], k).toBe(false);
    // Core stays on.
    for (const k of ["pos", "items", "stock", "purchases", "repair", "customers", "wallets"] as const) {
      expect(g[k], k).toBe(true);
    }
  });

  it("does not turn a Pro feature back on if the shop had it off", () => {
    const g = gateProFeatures({ ...allOn, reports: false }, true);
    expect(g.reports).toBe(false);
  });
});

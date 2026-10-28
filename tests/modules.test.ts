import { describe, expect, it } from "vitest";
import {
  BUSINESS_CATEGORIES,
  FEATURE_DEFINITIONS,
  FEATURE_GROUPS,
  categoryPreset,
  isPhoneShop,
  defaultFeaturesForMode,
  moduleSetting,
  moduleSettingForCategory,
  moduleSettingFromFeatures,
  parseModuleAccess,
} from "../src/lib/modules";
import { hiddenStandardKeys } from "../src/lib/incomeCategories";

describe("module access", () => {
  it("supports all three workspace modes", () => {
    expect(parseModuleAccess(moduleSetting("WALLET_ONLY"))).toMatchObject({
      mode: "WALLET_ONLY",
      miniMartEnabled: false,
      walletsEnabled: true,
    });
    expect(parseModuleAccess(moduleSetting("MINI_MART_ONLY"))).toMatchObject({
      mode: "MINI_MART_ONLY",
      miniMartEnabled: true,
      walletsEnabled: false,
    });
    expect(parseModuleAccess(moduleSetting("BOTH"))).toMatchObject({
      mode: "BOTH",
      miniMartEnabled: true,
      walletsEnabled: true,
    });
  });

  it("keeps legacy Mini Mart settings compatible", () => {
    expect(parseModuleAccess({ miniMartEnabled: true }).mode).toBe("BOTH");
    expect(parseModuleAccess({ miniMartEnabled: false }).mode).toBe("WALLET_ONLY");
  });

  it("defaults invalid settings to wallets only", () => {
    expect(parseModuleAccess(null).mode).toBe("WALLET_ONLY");
    expect(parseModuleAccess({ mode: "UNKNOWN" }).mode).toBe("WALLET_ONLY");
  });

  it("uses focused feature presets for every registration category", () => {
    const personal = parseModuleAccess(moduleSettingForCategory("PERSONAL"));
    expect(personal.features.transfers).toBe(true);
    expect(personal.features.pos).toBe(false);
    expect(personal.features.pos).toBe(false);

    const miniMart = parseModuleAccess(moduleSettingForCategory("MINI_MART"));
    expect(miniMart.features.pos).toBe(true);
    expect(miniMart.features.stock).toBe(true);
    expect(miniMart.features.wallets).toBe(true);

    // Every feature must sit in a group the settings screen renders, or its switch is
    // simply absent — which is how the repair toggle went missing.
    for (const feature of FEATURE_DEFINITIONS) {
      expect(FEATURE_GROUPS, feature.key).toContain(feature.group);
    }

    const mobileShop = parseModuleAccess(moduleSettingForCategory("MOBILE_SHOP"));
    // A phone shop both sells and repairs, so it gets the retail side and repair jobs.
    expect(mobileShop.features.repair).toBe(true);
    expect(mobileShop.features.pos).toBe(true);
    expect(mobileShop.features.stock).toBe(true);
    expect(mobileShop.features.biller).toBe(true);
    // Repair is a shop counter's job, not something a plain mini mart asked for.
    expect(miniMart.features.repair).toBe(false);

    const allInOne = parseModuleAccess(moduleSettingForCategory("ALL_IN_ONE"));
    // Everything, except the Online Shop: a public page stays off until a shop turns it on.
    expect(Object.entries(allInOne.features).every(([key, on]) => on === (key !== "onlineShop"))).toBe(true);
    for (const category of BUSINESS_CATEGORIES) {
      expect(parseModuleAccess(moduleSettingForCategory(category)).features.onlineShop, category).toBe(false);
    }
    expect(parseModuleAccess({ mode: "BOTH" }).features.onlineShop).toBe(false);
    // Every category must have a preset of its own; this catches one added without.
    for (const category of BUSINESS_CATEGORIES) {
      const preset = parseModuleAccess(moduleSettingForCategory(category));
      expect(Object.values(preset.features).some(Boolean), category).toBe(true);
    }
  });

  it("recomputes workspace mode from individual feature switches", () => {
    const features = defaultFeaturesForMode("WALLET_ONLY");
    features.pos = true;
    features.wallets = false;
    const parsed = parseModuleAccess(moduleSettingFromFeatures(features));

    expect(parsed.mode).toBe("BOTH");
    expect(parsed.features.pos).toBe(true);
    expect(parsed.features.wallets).toBe(false);
    expect(parsed.category).toBe("CUSTOM");
  });

  it("fills missing feature flags with backward-compatible defaults", () => {
    const parsed = parseModuleAccess({
      mode: "WALLET_ONLY",
      features: { transfers: false },
    });
    expect(parsed.features.transfers).toBe(false);
    expect(parsed.features.wallets).toBe(true);
    expect(parsed.features.pos).toBe(false);
    expect(categoryPreset("ALL_IN_ONE").about).toBe(true);
  });
});

describe("phone shop or not", () => {
  it("treats a mini mart as no phone shop, even with Top-up Billers or Repair on", () => {
    expect(isPhoneShop({ category: "MINI_MART", features: { ...categoryPreset("MINI_MART"), biller: true, repair: true } })).toBe(false);
    expect(isPhoneShop({ category: "MOBILE_SHOP", features: categoryPreset("MOBILE_SHOP") })).toBe(true);
    expect(isPhoneShop({ category: "ALL_IN_ONE", features: categoryPreset("ALL_IN_ONE") })).toBe(true);
  });

  it("counts a shop from before categories as one when it runs Repair", () => {
    expect(isPhoneShop({ category: "CUSTOM", features: { ...categoryPreset("MINI_MART"), repair: true } })).toBe(true);
    expect(isPhoneShop({ category: "CUSTOM", features: categoryPreset("MINI_MART") })).toBe(false);
  });

  it("offers Service and Bill income only to shops running Repair and Top-up Billers", () => {
    expect(hiddenStandardKeys(categoryPreset("MINI_MART"))).toEqual(["DAILY_SERVICE", "DAILY_BILL"]);
    expect(hiddenStandardKeys({ ...categoryPreset("MINI_MART"), biller: true })).toEqual(["DAILY_SERVICE"]);
    expect(hiddenStandardKeys(categoryPreset("MOBILE_SHOP"))).toEqual([]);
  });
});

describe("saving the menu", () => {
  it("keeps the shop's type when a menu item is switched on", () => {
    const features = { ...categoryPreset("MOBILE_SHOP"), users: true };
    expect(moduleSettingFromFeatures(features, "MOBILE_SHOP").category).toBe("MOBILE_SHOP");
  });
});

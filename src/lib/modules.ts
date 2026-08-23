export const MODULE_MODES = ["WALLET_ONLY", "MINI_MART_ONLY", "BOTH"] as const;
export type ModuleMode = (typeof MODULE_MODES)[number];

export const BUSINESS_CATEGORIES = [
  "PERSONAL",
  "MINI_MART",
  "MOBILE_SHOP",
  "ALL_IN_ONE",
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const FEATURE_KEYS = [
  "pos",
  "purchases",
  "items",
  "stock",
  "repair",
  "biller",
  "wallets",
  "transfers",
  "withdraw",
  "credit",
  "incomeExpense",
  "reports",
  "customers",
  "suppliers",
  "users",
  "audit",
  "telegram",
  "about",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureVisibility = Record<FeatureKey, boolean>;

export const FEATURE_DEFINITIONS: {
  key: FeatureKey;
  label: string;
  group: "Mini Mart" | "Mobile Shop" | "Mahar Mini POS" | "General";
}[] = [
  { key: "pos", label: "Sales & POS", group: "Mini Mart" },
  { key: "purchases", label: "Purchases", group: "Mini Mart" },
  { key: "items", label: "Items", group: "Mini Mart" },
  { key: "stock", label: "Stock", group: "Mini Mart" },
  { key: "repair", label: "Repair Jobs", group: "Mobile Shop" },
  { key: "biller", label: "Top-up Billers", group: "Mobile Shop" },
  { key: "suppliers", label: "Suppliers", group: "Mini Mart" },
  { key: "wallets", label: "Wallets", group: "Mahar Mini POS" },
  { key: "transfers", label: "Transfer", group: "Mahar Mini POS" },
  { key: "withdraw", label: "Withdraw", group: "Mahar Mini POS" },
  { key: "credit", label: "Credit & Payable", group: "Mahar Mini POS" },
  { key: "incomeExpense", label: "Income & Expense", group: "Mahar Mini POS" },
  { key: "reports", label: "Reports", group: "General" },
  { key: "customers", label: "Customers", group: "General" },
  { key: "users", label: "Users & Roles", group: "General" },
  { key: "audit", label: "Audit Logs", group: "General" },
  { key: "telegram", label: "Telegram", group: "General" },
  { key: "about", label: "About Us", group: "General" },
];

export const FEATURE_GROUPS = ["Mini Mart", "Mobile Shop", "Mahar Mini POS", "General"] as const;

export const BUSINESS_CATEGORY_LABELS: Record<BusinessCategory, string> = {
  PERSONAL: "Personal wallet & notes",
  MINI_MART: "Mini Mart / retail shop",
  MOBILE_SHOP: "Mobile phone shop & repair",
  ALL_IN_ONE: "All-in-one business",
};

const MINI_MART_FEATURES: FeatureKey[] = ["pos", "purchases", "items", "stock", "suppliers", "repair", "biller"];
const WALLET_FEATURES: FeatureKey[] = [
  "wallets",
  "transfers",
  "withdraw",
  "credit",
  "incomeExpense",
];

function visibility(enabled: readonly FeatureKey[]): FeatureVisibility {
  const enabledSet = new Set(enabled);
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, enabledSet.has(key)])
  ) as FeatureVisibility;
}

export function defaultFeaturesForMode(mode: ModuleMode): FeatureVisibility {
  const hidden = new Set<FeatureKey>();
  if (mode === "WALLET_ONLY") MINI_MART_FEATURES.forEach((key) => hidden.add(key));
  if (mode === "MINI_MART_ONLY") WALLET_FEATURES.forEach((key) => hidden.add(key));
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, !hidden.has(key)])
  ) as FeatureVisibility;
}

export function categoryPreset(category: BusinessCategory): FeatureVisibility {
  switch (category) {
    case "PERSONAL":
      return visibility([
        "wallets", "transfers", "withdraw", "credit", "incomeExpense", "telegram", "about",
      ]);
    case "MINI_MART":
      return visibility([
        "pos", "purchases", "items", "stock", "wallets", "transfers", "withdraw",
        "credit", "incomeExpense", "reports", "customers", "suppliers", "telegram", "about",
      ]);
    case "MOBILE_SHOP":
      // A phone shop sells handsets and accessories and repairs them, so it wants the
      // whole retail side plus repair jobs.
      return visibility([
        "pos", "purchases", "items", "stock", "repair", "biller", "wallets", "transfers",
        "withdraw", "credit", "incomeExpense", "reports", "customers", "suppliers", "telegram",
        "about",
      ]);
    case "ALL_IN_ONE":
      return visibility(FEATURE_KEYS);
  }
}

export function modeForFeatures(features: FeatureVisibility): ModuleMode {
  const hasMiniMart = MINI_MART_FEATURES.some((key) => features[key]);
  const hasWallet = WALLET_FEATURES.some((key) => features[key]);
  if (hasMiniMart && hasWallet) return "BOTH";
  if (hasMiniMart) return "MINI_MART_ONLY";
  return "WALLET_ONLY";
}

export interface ModuleAccess {
  mode: ModuleMode;
  miniMartEnabled: boolean;
  walletNoteEnabled: boolean;
  category: BusinessCategory | "CUSTOM";
  features: FeatureVisibility;
}

export function parseModuleAccess(value: unknown): ModuleAccess {
  const setting = value && typeof value === "object"
    ? value as { mode?: unknown; miniMartEnabled?: unknown; category?: unknown; features?: unknown }
    : {};
  const legacyMode = MODULE_MODES.includes(setting.mode as ModuleMode)
    ? setting.mode as ModuleMode
    : setting.miniMartEnabled === true
      ? "BOTH"
      : "WALLET_ONLY";
  const rawFeatures = setting.features && typeof setting.features === "object"
    ? setting.features as Record<string, unknown>
    : null;
  const defaults = defaultFeaturesForMode(legacyMode);
  const features = Object.fromEntries(
    FEATURE_KEYS.map((key) => [
      key,
      rawFeatures && typeof rawFeatures[key] === "boolean" ? rawFeatures[key] : defaults[key],
    ])
  ) as FeatureVisibility;
  const mode = rawFeatures ? modeForFeatures(features) : legacyMode;
  const category = BUSINESS_CATEGORIES.includes(setting.category as BusinessCategory)
    ? setting.category as BusinessCategory
    : "CUSTOM";

  return {
    mode,
    miniMartEnabled: MINI_MART_FEATURES.some((key) => features[key]),
    walletNoteEnabled: WALLET_FEATURES.some((key) => features[key]),
    category,
    features,
  };
}

export function moduleSetting(
  mode: ModuleMode,
  features = defaultFeaturesForMode(mode),
  category: BusinessCategory | "CUSTOM" = "CUSTOM"
) {
  return {
    mode: modeForFeatures(features),
    miniMartEnabled: MINI_MART_FEATURES.some((key) => features[key]),
    category,
    features,
  };
}

export function moduleSettingForCategory(category: BusinessCategory) {
  const features = categoryPreset(category);
  return moduleSetting(modeForFeatures(features), features, category);
}

export function moduleSettingFromFeatures(features: FeatureVisibility) {
  return moduleSetting(modeForFeatures(features), features, "CUSTOM");
}

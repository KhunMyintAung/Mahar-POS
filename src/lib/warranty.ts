/** Warranties offered when a phone is sold, by whether it is new or second-hand.
 *
 *  Which list applies is read off the product's category (or name): "Phone New" gets the
 *  new-phone choices, "Phone Second" the second-hand ones. Kept free of server imports so
 *  the POS, the settings page and the sale API share one reading of it.
 */

import { productKind } from "./productKind";

export interface WarrantyOption {
  label: string;
  /** Length in days; 0 means no warranty and nothing to count down. */
  days: number;
}

export interface WarrantySettings {
  newPhone: WarrantyOption[];
  secondHand: WarrantyOption[];
}

export const WARRANTY_SETTING = "warranty";

export const DEFAULT_WARRANTY: WarrantySettings = {
  newPhone: [
    { label: "1 year warranty", days: 365 },
    { label: "6 months warranty", days: 180 },
    { label: "No warranty", days: 0 },
  ],
  secondHand: [
    { label: "1 month warranty", days: 30 },
    { label: "7 days warranty", days: 7 },
    { label: "No warranty", days: 0 },
  ],
};

export type PhoneCondition = "NEW" | "SECOND";

const SECOND_WORDS = ["second", "secount", "2nd", "used", "refurb", "အဟောင်း", "တစ်ပတ်ရစ်"];
const NEW_WORDS = ["new", "brand new", "အသစ်"];

/** New or second-hand, for a phone; null for anything that is not a phone. Second-hand is
 *  checked first so "Second hand (like new)" reads as second-hand. */
export function phoneCondition(item: { name: string; category?: { name: string } | null }): PhoneCondition | null {
  const category = item.category?.name.toLowerCase() ?? "";
  const text = `${category} ${item.name.toLowerCase()}`;
  if (productKind(item) !== "phone" && !category.includes("phone") && !category.includes("ဖုန်း")) return null;
  if (SECOND_WORDS.some((w) => text.includes(w))) return "SECOND";
  if (NEW_WORDS.some((w) => text.includes(w))) return "NEW";
  return null;
}

export function warrantyOptionsFor(settings: WarrantySettings, condition: PhoneCondition | null): WarrantyOption[] {
  if (condition === "NEW") return settings.newPhone;
  if (condition === "SECOND") return settings.secondHand;
  return [];
}

function parseOptions(value: unknown, fallback: WarrantyOption[]): WarrantyOption[] {
  if (!Array.isArray(value)) return fallback;
  const options = value
    .map((o) => {
      const v = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
      const label = typeof v.label === "string" ? v.label.trim().slice(0, 60) : "";
      const days = Number(v.days);
      return { label, days: Number.isInteger(days) && days >= 0 && days <= 3650 ? days : 0 };
    })
    .filter((o) => o.label)
    .slice(0, 8);
  return options;
}

export function parseWarrantySettings(value: unknown): WarrantySettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    newPhone: parseOptions(v.newPhone, DEFAULT_WARRANTY.newPhone),
    secondHand: parseOptions(v.secondHand, DEFAULT_WARRANTY.secondHand),
  };
}

/** The last day of cover, or null when there is none. */
export function warrantyUntil(soldAt: Date, days: number): Date | null {
  if (days <= 0) return null;
  return new Date(soldAt.getTime() + days * 24 * 3600 * 1000);
}

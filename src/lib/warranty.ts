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
  /** Printed on the warranty card, one line per line; the first line is the heading. */
  newTerms: string;
  secondTerms: string;
}

export const WARRANTY_SETTING = "warranty";

export const DEFAULT_NEW_TERMS = [
  "【 Brand New ဖုန်း အာမခံချက်နှင့် သတိပေးချက် 】",
  "၁။ Official Warranty",
  "စက်ရုံထုတ် တရားဝင် အာမခံ (၁) နှစ် ပါဝင်ပါသည်။",
  "၂။ 7-Day Replacement",
  "ဝယ်ယူပြီး (၇) ရက်အတွင်း စက်ရုံထုတ် Factory Hardware Defect ပါဝင်ပါက အသစ်တစ်လုံး အစားထိုး လဲလှယ်ပေးပါသည်။",
  "၃။ အာမခံ မအကျုံးဝင်သည့် အချက်များ",
  "- ရေဝင်ခြင်း ၊ ပြုတ်ကျခြင်း ၊ ဖိမိခြင်း သို့မဟုတ် ရုပ်ပိုင်းဆိုင်ရာ ထိခိုက်ပျက်စီးခြင်း ။",
  "- LCD Display မှန်ကွဲခြင်း / မှန်စင်း ကျခြင်း ။",
  "- Unofficial System Software တင်ခြင်း နှင့် အာမခံ စတိကာ ပျက်စီးခြင်း ။",
].join("\n");

export const DEFAULT_SECOND_TERMS = [
  "【 Second Hand ဖုန်း အာမခံချက်နှင့် သတိပေးချက် 】",
  "၁။ ဆိုင်အာမခံ",
  "ဘောက်ချာပါ ရက်အတွင်း Board / Hardware ချို့ယွင်းချက်ကို ဆိုင်မှ အခမဲ့ ပြင်ပေးပါသည်။",
  "၂။ စစ်ဆေးပြီး ဝယ်ယူရန်",
  "ဖုန်း၏ အခြေအနေ၊ ဘက်ထရီ၊ ကင်မရာ နှင့် Function များကို ဝယ်ယူချိန်တွင် စစ်ဆေးပြီးမှ ယူပါ။",
  "၃။ အာမခံ မအကျုံးဝင်သည့် အချက်များ",
  "- ရေဝင်ခြင်း ၊ ပြုတ်ကျခြင်း ၊ ဖိမိခြင်း သို့မဟုတ် ရုပ်ပိုင်းဆိုင်ရာ ထိခိုက်ပျက်စီးခြင်း ။",
  "- LCD Display မှန်ကွဲခြင်း / မှန်စင်း ကျခြင်း ။",
  "- ဆိုင်ပြင်ပတွင် ဖွင့်ပြင်ခြင်း နှင့် အာမခံ စတိကာ ပျက်စီးခြင်း ။",
].join("\n");

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
  newTerms: DEFAULT_NEW_TERMS,
  secondTerms: DEFAULT_SECOND_TERMS,
};

/** The terms to print for a phone of this condition. */
export function warrantyTermsFor(settings: WarrantySettings, condition: string | null | undefined): string {
  return condition === "SECOND" ? settings.secondTerms : settings.newTerms;
}

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
  const terms = (x: unknown, fallback: string) => (typeof x === "string" ? x.slice(0, 3000) : fallback);
  return {
    newPhone: parseOptions(v.newPhone, DEFAULT_WARRANTY.newPhone),
    secondHand: parseOptions(v.secondHand, DEFAULT_WARRANTY.secondHand),
    newTerms: terms(v.newTerms, DEFAULT_NEW_TERMS),
    secondTerms: terms(v.secondTerms, DEFAULT_SECOND_TERMS),
  };
}

/** The last day of cover, or null when there is none. */
export function warrantyUntil(soldAt: Date, days: number): Date | null {
  if (days <= 0) return null;
  return new Date(soldAt.getTime() + days * 24 * 3600 * 1000);
}

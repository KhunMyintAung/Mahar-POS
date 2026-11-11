/** What a shop can set up for its repair voucher: the number format and the printed text.
 *
 *  Stored as the "repair_voucher" setting. Kept free of server imports so the voucher and
 *  the settings page can share the defaults.
 */

import { currencyLanguage, isAppLanguage, type AppLanguage } from "@/lib/currency";
import { VOUCHER_TEXT } from "@/lib/repairVoucherText";

/** "auto" follows the shop's main currency (THB Thai, USD English, MMK Myanmar). */
export type VoucherLanguageChoice = "auto" | AppLanguage;
export const VOUCHER_LANGUAGE_CHOICES: VoucherLanguageChoice[] = ["auto", "mm", "en", "th"];

export interface RepairVoucherSettings {
  /** Letters in front of the number, e.g. "MS" gives MS0001. Empty takes them from the shop name. */
  prefix: string;
  /** Minimum digits; the number grows past it rather than wrapping (MS999, MS1000). */
  digits: number;
  /** The language the voucher and the customer's status page are written in. */
  language: VoucherLanguageChoice;
  /** A line under the shop name, e.g. what the shop does. */
  tagline: string;
  /** The warnings printed on the voucher, one per line. */
  terms: string[];
  /** Printed under the QR code. */
  qrCaption: string;
}

/** The warnings a voucher starts with, in a language. */
export const defaultRepairTerms = (language: AppLanguage) => VOUCHER_TEXT[language].terms;

export const DEFAULT_REPAIR_TERMS = defaultRepairTerms("mm");

/** What a shop that has set nothing prints: the Myanmar voucher of an MMK shop. */
export const DEFAULT_REPAIR_VOUCHER: RepairVoucherSettings = {
  prefix: "",
  digits: 4,
  language: "auto",
  tagline: "",
  terms: DEFAULT_REPAIR_TERMS,
  qrCaption: VOUCHER_TEXT.mm.qrCaption,
};

export const PREFIX_PATTERN = /^[A-Za-z0-9]{0,6}$/;

/** The language a shop's voucher is in: the one it picked, or its main currency's. */
export function voucherLanguage(choice: VoucherLanguageChoice | undefined, currency: string | null | undefined): AppLanguage {
  return isAppLanguage(choice) ? choice : currencyLanguage(currency);
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);
const LANGS = Object.keys(VOUCHER_TEXT) as AppLanguage[];
/** True for the ready-made warnings of any language: text the shop never wrote itself. */
export const isDefaultTerms = (terms: string[]) => LANGS.some((l) => sameLines(terms, VOUCHER_TEXT[l].terms));
const isDefaultCaption = (caption: string) => LANGS.some((l) => caption === VOUCHER_TEXT[l].qrCaption);

/** Read a stored value, keeping anything sensible and defaulting the rest.
 *
 *  The ready-made warnings and QR caption follow the voucher's language (so they are right
 *  for a THB or USD shop, and change over when the language does); text the shop wrote
 *  itself is kept as it is. */
export function parseRepairVoucherSettings(value: unknown, currency?: string | null): RepairVoucherSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : undefined);
  const prefix = str(v.prefix, 6);
  const digits = Number(v.digits);
  const terms = Array.isArray(v.terms)
    ? v.terms.map((t) => str(t, 200)).filter((t): t is string => Boolean(t)).slice(0, 12)
    : undefined;
  const language: VoucherLanguageChoice = isAppLanguage(v.language) ? v.language : "auto";
  const text = VOUCHER_TEXT[voucherLanguage(language, currency)];
  const qrCaption = str(v.qrCaption, 120);
  return {
    prefix: prefix !== undefined && PREFIX_PATTERN.test(prefix) ? prefix.toUpperCase() : DEFAULT_REPAIR_VOUCHER.prefix,
    digits: Number.isInteger(digits) && digits >= 1 && digits <= 8 ? digits : DEFAULT_REPAIR_VOUCHER.digits,
    language,
    tagline: str(v.tagline, 120) ?? DEFAULT_REPAIR_VOUCHER.tagline,
    terms: terms === undefined || isDefaultTerms(terms) ? text.terms : terms,
    qrCaption: qrCaption === undefined || isDefaultCaption(qrCaption) ? text.qrCaption : qrCaption,
  };
}

/** Voucher letters taken from the shop's name: the initials of its first two words
 *  ("Mahar Shwe Mobile" → MS), or a short all-capitals first word as it is ("AC Mobile" →
 *  AC). A name with no Latin letters, such as one written in Myanmar, falls back to RP. */
export function shopPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length === 0) return "RP";
  const first = words[0].replace(/[^A-Za-z0-9]/g, "");
  if (/^[A-Z]{2,4}$/.test(first)) return first;
  const initials = words.slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return initials.length === 2 ? initials : first.slice(0, 2).toUpperCase();
}

export function formatVoucherNo(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

/** The currencies a shop can keep its books in. A shop has one main currency (its
 *  Business.currency), chosen at sign-up: reports, totals, the till and the dashboard count in
 *  it. A wallet may hold another currency (a THB float in an MMK shop), but its money is
 *  not added into the main-currency totals. */

export const CURRENCIES = ["MMK", "USD", "THB"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "MMK";

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/** The shop's main currency from a stored value, MMK for anything unknown. */
export function asCurrency(v: unknown): Currency {
  return isCurrency(v) ? v : DEFAULT_CURRENCY;
}

/** Text written for an MMK shop ("Total MMK Balance", "Charge (MMK)", a Telegram notice)
 *  in the shop's own currency. Only the code as a word is swapped. */
export function inCurrency(text: string, currency: string): string {
  return currency === "MMK" ? text : text.replace(/\bMMK\b/g, currency);
}

/** The languages the app is shown in. */
export type AppLanguage = "mm" | "en" | "th";

export function isAppLanguage(v: unknown): v is AppLanguage {
  return v === "mm" || v === "en" || v === "th";
}

/** The language an account starts in, from its main currency: a THB shop is in Thailand and
 *  reads Thai, a USD shop English, an MMK shop Myanmar. A user may still switch by hand. */
export function currencyLanguage(currency: string | null | undefined): AppLanguage {
  return currency === "THB" ? "th" : currency === "USD" ? "en" : "mm";
}

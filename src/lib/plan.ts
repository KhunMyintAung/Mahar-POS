// Mahar POS is freemium: a shop runs the core for free, and pays for Pro (reports, more than
// one branch, the online shop and bot, billers, full money tools, staff, offline and push).
// A shop is Pro while `Business.proUntil` is in the future — a paid period or the free trial.

export type Plan = "FREE" | "PRO";

/** How long a new shop (and every shop at launch) gets Pro for free. */
export const TRIAL_DAYS = 60;

/** The paid levels. Pro is every Pro feature; Fully Access is Pro plus the extras that are a
 *  promise rather than a switch — unlimited data and photo input, and quick support. No feature
 *  is turned off for Pro, so a shop's access is the same on both; the tier is billing and support. */
export type ProTier = "PRO" | "FULL";

/** Price in kyat per month, by tier. */
export const TIER_PRICE_MMK: Record<ProTier, number> = { PRO: 15000, FULL: 50000 };

/** The Pro price, in kyat per month, shown on the upgrade screen. */
export const PRO_PRICE_MMK = TIER_PRICE_MMK.PRO;

/** The lengths a shop can buy at once, in months. */
export const PRO_MONTH_OPTIONS = [1, 3, 6, 12] as const;

/** What a longer term saves, in kyat off the total (any tier): 6 months and a year. */
export const TERM_SAVING_MMK: Record<number, number> = { 6: 5000, 12: 10000 };

/** Reads a stored tier; anything but FULL is PRO (older shops and payments have none). */
export function tierOf(value: string | null | undefined): ProTier {
  return value === "FULL" ? "FULL" : "PRO";
}

/** The total to pay, in kyat, for `months` of a tier — the monthly price times the months, less
 *  the term saving. The server works this out itself; the client only shows it. */
export function proTotalMMK(tier: ProTier, months: number): number {
  return TIER_PRICE_MMK[tier] * months - (TERM_SAVING_MMK[months] ?? 0);
}

/** Thai shops pay in baht by PromptPay, on a price list of their own (not a converted kyat price):
 *  baht per month by tier, and what 6 months and a year save off the total. */
export const TIER_PRICE_THB: Record<ProTier, number> = { PRO: 200, FULL: 300 };
export const TERM_SAVING_THB: Record<number, number> = { 6: 50, 12: 100 };

/** The total to pay, in baht, for `months` of a tier — the Thai price list, same shape as the kyat one. */
export function proTotalTHB(tier: ProTier, months: number): number {
  return TIER_PRICE_THB[tier] * months - (TERM_SAVING_THB[months] ?? 0);
}

/** The date a trial that starts now runs until. */
export function trialUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
}

/** Pro's end date after adding `months`, built on whichever is later — now or the current end —
 *  so paying early never loses the days already in hand. Used by the admin extend and the
 *  approval of a shop's payment, so both move the date the same way. */
export function extendProUntil(proUntil: Date | string | null | undefined, months: number, now: Date = new Date()): Date {
  const until = proUntil ? (proUntil instanceof Date ? proUntil : new Date(proUntil)) : null;
  const base = until && until.getTime() > now.getTime() ? until : now;
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** PRO while proUntil is still in the future (a paid period or the trial), else FREE. */
export function planOf(proUntil: Date | string | null | undefined, now: Date = new Date()): Plan {
  if (!proUntil) return "FREE";
  const until = proUntil instanceof Date ? proUntil : new Date(proUntil);
  return until.getTime() > now.getTime() ? "PRO" : "FREE";
}

export function isPro(proUntil: Date | string | null | undefined, now: Date = new Date()): boolean {
  return planOf(proUntil, now) === "PRO";
}

/** Whole days of Pro left (0 when expired or never set); for the "expires in N days" notice. */
export function proDaysLeft(proUntil: Date | string | null | undefined, now: Date = new Date()): number {
  if (!proUntil) return 0;
  const until = proUntil instanceof Date ? proUntil : new Date(proUntil);
  const ms = until.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

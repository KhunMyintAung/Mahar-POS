// Mahar POS is freemium: a shop runs the core for free, and pays for Pro (reports, more than
// one branch, the online shop and bot, billers, full money tools, staff, offline and push).
// A shop is Pro while `Business.proUntil` is in the future — a paid period or the free trial.

export type Plan = "FREE" | "PRO";

/** How long a new shop (and every shop at launch) gets Pro for free. */
export const TRIAL_DAYS = 60;

/** The Pro price, in kyat per month, shown on the upgrade screen. */
export const PRO_PRICE_MMK = 15000;

/** The date a trial that starts now runs until. */
export function trialUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
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

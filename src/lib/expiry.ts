/** Best-before dates on items (a mini mart's food, drinks and medicine). Kept free of server
 *  imports, so the screens and the API count "expiring soon" the same way. */

/** Within this many days of its date an item counts as expiring soon. */
export const EXPIRY_WARN_DAYS = 30;

/** What an expiry field accepts: a YYYY-MM-DD date, or empty to clear it. */
export const EXPIRY_PATTERN = /^(\d{4}-\d{2}-\d{2})?$/;
export const EXPIRY_FORMAT_ERROR = "Expiry date must be a date (YYYY-MM-DD)";

/** The Date to store for a checked YYYY-MM-DD field: the day at midnight UTC, null when it was
 *  cleared, undefined when it was not sent. */
export function expiryDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`);
}

/** Whole days from today (YYYY-MM-DD, Yangon) to an expiry date; negative once it has passed. */
export function daysLeft(expiresAt: string, today: string): number {
  return Math.round((Date.parse(expiresAt.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

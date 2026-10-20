/** Income categories the dashboard folds into its own totals instead of "Other income".
 *  A shop records takings it did not ring through the till under these, and expects them
 *  counted with sales and with service work. */
export const DAILY_SALE_INCOME = "Daily Sale Income";
export const DAILY_SERVICE_INCOME = "Daily Service Income";

export const DEFAULT_INCOME_CATEGORIES = [DAILY_SALE_INCOME, DAILY_SERVICE_INCOME, "Other Income"];

export type IncomeBucket = "sales" | "service" | "other";

/** Which dashboard total an income entry belongs to, by its category name. */
export function incomeBucket(categoryName: string | null | undefined): IncomeBucket {
  const name = (categoryName ?? "").trim().toLowerCase();
  if (name === DAILY_SALE_INCOME.toLowerCase()) return "sales";
  if (name === DAILY_SERVICE_INCOME.toLowerCase()) return "service";
  return "other";
}

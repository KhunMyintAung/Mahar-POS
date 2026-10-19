/** Changing the selling price of many items at once.
 *
 *  Prices are minor units (BigInt), as everywhere else. Kept free of server imports so the
 *  items page can preview exactly what the server will save.
 */

export type RepriceMode = "set" | "percent" | "amount";
export type RepriceDirection = "up" | "down";

export interface RepriceRule {
  /** set: the new price; percent: by this many percent; amount: by this much money. */
  mode: RepriceMode;
  /** Whole kyat for set and amount; a percentage for percent. */
  value: number;
  /** For percent and amount: raise the price, or lower it (a discount). */
  direction: RepriceDirection;
  /** Round the result to the nearest multiple of this many kyat; 0 or 1 leaves it. */
  roundTo: number;
}

const MINOR = 100n;

/** The new selling price, never below zero. */
export function repriced(current: bigint, rule: RepriceRule): bigint {
  const sign = rule.direction === "down" ? -1 : 1;
  let next: number;
  const kyat = Number(current) / Number(MINOR);
  if (rule.mode === "set") next = rule.value;
  else if (rule.mode === "percent") next = kyat * (1 + (sign * rule.value) / 100);
  else next = kyat + sign * rule.value;

  if (rule.roundTo > 1) next = Math.round(next / rule.roundTo) * rule.roundTo;
  else next = Math.round(next);
  return BigInt(Math.max(0, next)) * MINOR;
}

export function validRule(rule: RepriceRule): string | null {
  if (!Number.isFinite(rule.value) || rule.value < 0) return "Enter a number that is not negative";
  if (rule.mode === "percent" && rule.direction === "down" && rule.value > 100) return "A discount cannot be more than 100%";
  return null;
}

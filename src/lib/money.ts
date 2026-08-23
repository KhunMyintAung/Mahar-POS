import Decimal from "decimal.js";

// All money amounts are BigInt minor units: 1 unit = 1/100 of the currency.
// MMK in practice has no subunits but we keep scale 2 uniformly for THB satang
// and future currencies. Rates and percentages are decimal strings.

export const SCALE = 100n;

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** Parse a user-entered amount string ("1,500.25") into minor units. */
export function toMinor(input: string | number): bigint {
  const s = String(input).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new MoneyError(`Invalid amount: ${input}`);
  const d = new Decimal(s).times(100);
  if (!d.isInteger()) {
    // more than 2 decimal places — round half-up to minor unit
    return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
  }
  return BigInt(d.toFixed(0));
}

/** Minor units -> display string with thousands separators. */
export function formatMinor(minor: bigint | number | string, opts?: { decimals?: boolean }): string {
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const showFrac = opts?.decimals ?? frac !== 0n;
  const s = showFrac ? `${wholeStr}.${frac.toString().padStart(2, "0")}` : wholeStr;
  return neg ? `-${s}` : s;
}

/** Minor units -> plain decimal string ("1500.25") for APIs/exports. */
export function minorToDecimalString(minor: bigint): string {
  return new Decimal(minor.toString()).div(100).toFixed(2);
}

/** Multiply minor units by a decimal-string factor (odds, rate), returns minor units. */
export function mulMinor(minor: bigint, factor: string): bigint {
  const d = new Decimal(minor.toString()).times(new Decimal(factor));
  return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/** percent of minor units: pct is a decimal string like "10" for 10%. */
export function percentOf(minor: bigint, pct: string): bigint {
  const d = new Decimal(minor.toString()).times(new Decimal(pct)).div(100);
  return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/** Convert an amount between currencies with a decimal-string rate
 *  (rate = units of target currency per 1 unit of source currency). */
export function convertMinor(minor: bigint, rate: string): bigint {
  return mulMinor(minor, rate);
}

export function isValidDecimalString(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s.replace(/,/g, "").trim());
}

export class MoneyError extends Error {}

/** Validate a 3D number: exactly three digits, leading zeros preserved. */
export function isThreeDigit(n: string): boolean {
  return /^\d{3}$/.test(n);
}

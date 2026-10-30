import { getAddress, isAddress } from "ethers";

/** Mahar Shwe Point (MSP): MaharGroup's point token on BNB Chain.
 *
 *  Points are kept in hundredths ("centi-points", 100 = 1 MSP) so they fit a BigInt
 *  column; on chain MSP has 18 decimals. */

/** Hundredths of a point → the token's 18-decimal units. */
export const centiToWei = (centi: bigint) => centi * 10n ** 16n;

/** "12.5" for 1250 hundredths. */
export function fmtMsp(centi: bigint | string | number): string {
  const c = BigInt(centi);
  const whole = c / 100n, frac = c % 100n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}`;
}

/** The checksummed address, or null when the text is not a wallet address. */
export function normalizeMspAddress(text: string): string | null {
  const t = text.trim();
  return isAddress(t) ? getAddress(t) : null;
}


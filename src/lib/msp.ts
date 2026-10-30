import { getAddress, isAddress } from "ethers";

/** Mahar Shwe Point (MSP): a loyalty point on BNB Chain that customers earn on their
 *  purchases. Each shop switches it on and picks how much a customer spends per point;
 *  the platform's minter wallet (env MSP_*) puts the points in the customers' wallets.
 *
 *  Points are kept in hundredths ("centi-points", 100 = 1 MSP) so they fit a BigInt
 *  column; on chain MSP has 18 decimals. */
export const MSP_KEY = "msp";

export interface MspSettings {
  enabled: boolean;
  /** How much the customer spends, in the shop's currency, for one MSP. */
  perPoint: number;
}

export const DEFAULT_MSP: MspSettings = { enabled: false, perPoint: 1000 };

export function parseMspSettings(raw: unknown): MspSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<MspSettings>;
  const perPoint = Number(v.perPoint);
  return {
    enabled: Boolean(v.enabled),
    perPoint: Number.isInteger(perPoint) && perPoint >= 1 && perPoint <= 100_000_000 ? perPoint : DEFAULT_MSP.perPoint,
  };
}

/** Hundredths of a point earned on an amount in minor units (1/100 of the currency):
 *  points = major / perPoint, so hundredths = minor / perPoint, rounded down. */
export function centiPointsFor(paidMinor: bigint, perPoint: number): bigint {
  if (paidMinor <= 0n || perPoint < 1) return 0n;
  return paidMinor / BigInt(perPoint);
}

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

export interface BatchRecipient { address: string; amount: bigint }

/** Most recipients in one mintBatch call; keeps each transaction well inside a block. */
export const MAX_BATCH_RECIPIENTS = 100;

/** Sums the awards per wallet, in first-seen order, up to MAX_BATCH_RECIPIENTS wallets.
 *  Returns the recipients and the ids of the awards they cover; awards for wallets past
 *  the limit wait for the next batch. */
export function buildBatch(awards: { id: string; address: string; amount: bigint }[]) {
  const byAddress = new Map<string, BatchRecipient>();
  const ids: string[] = [];
  for (const a of awards) {
    const key = a.address.toLowerCase();
    let r = byAddress.get(key);
    if (!r) {
      if (byAddress.size >= MAX_BATCH_RECIPIENTS) continue;
      r = { address: a.address, amount: 0n };
      byAddress.set(key, r);
    }
    r.amount += a.amount;
    ids.push(a.id);
  }
  const recipients = [...byAddress.values()];
  return { recipients, ids, total: recipients.reduce((s, r) => s + r.amount, 0n) };
}

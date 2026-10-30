/** The shop's MSP wallet inside Mahar POS. Points earned for using Mahar POS land in its
 *  balance; shops send MSP to each other free (only the balances move), and the chain is
 *  touched only when a shop takes MSP out to its own BNB Chain wallet, for a fee. Amounts
 *  are in hundredths of a point (100 = 1 MSP). */

/** The withdrawal fee and minimum (PlatformSetting, set by the platform). */
export const MSP_WALLET_KEY = "msp_wallet";

export interface MspWalletSettings {
  /** Kept from every withdrawal, to pay the gas. */
  feeCenti: bigint;
  /** The smallest withdrawal, fee included. */
  minCenti: bigint;
}

export const DEFAULT_WALLET: MspWalletSettings = { feeCenti: 10n, minCenti: 100n }; // 0.1 MSP fee, 1 MSP minimum

export function parseWalletSettings(raw: unknown): MspWalletSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const centi = (x: unknown, dflt: bigint) => {
    const n = Number(x);
    return Number.isInteger(n) && n >= 0 && n <= 100_000_000_00 ? BigInt(n) : dflt;
  };
  const feeCenti = centi(v.feeCenti, DEFAULT_WALLET.feeCenti);
  const minCenti = centi(v.minCenti, DEFAULT_WALLET.minCenti);
  // A withdrawal must always leave something to send after the fee.
  return { feeCenti, minCenti: minCenti > feeCenti ? minCenti : feeCenti + 1n };
}

/** "1.5" → 150 hundredths; null for anything that is not a positive amount with at most
 *  two decimals. */
export function parseMspAmount(text: string): bigint | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const centi = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  return centi > 0n ? centi : null;
}

/** The shop's MSP wallet ID, which other shops type to send it MSP. */
export function shopWalletId(businessId: string): string {
  return "MSP-" + businessId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** The id prefix a typed wallet ID stands for, or null when it is not one. */
export function parseShopWalletId(text: string): string | null {
  const m = /^(?:MSP-?)?([0-9a-f]{8})$/i.exec(text.trim());
  return m ? m[1].toLowerCase() : null;
}

export interface MspHolding { earned: bigint; received: bigint; sent: bigint; withdrawn: bigint; balance: bigint }

/** Each shop's MSP wallet from per-shop sums: rewards credited, MSP received and sent, and
 *  withdrawals (fee included, failed ones left out). */
export function holdingsByShop(parts: Record<"earned" | "received" | "sent" | "withdrawn", { id: string; amount: bigint }[]>) {
  const out = new Map<string, MspHolding>();
  const of = (id: string) => {
    let h = out.get(id);
    if (!h) out.set(id, (h = { earned: 0n, received: 0n, sent: 0n, withdrawn: 0n, balance: 0n }));
    return h;
  };
  for (const key of ["earned", "received", "sent", "withdrawn"] as const) {
    for (const p of parts[key]) of(p.id)[key] += p.amount;
  }
  for (const h of out.values()) h.balance = h.earned + h.received - h.sent - h.withdrawn;
  return out;
}

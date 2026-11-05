/** Top-up cards counted from biller sales: a sale made by tapping cards keeps how many of
 *  each amount (kyat) it was, so the day's cards sold can be counted against the cards left. */

export type CardCounts = Record<string, number>;

export interface CardTally {
  billerId: string;
  billerName: string;
  /** Each card amount sold and how many, smallest first. */
  cards: { amount: number; count: number }[];
  /** Sales typed in by amount rather than by card (minor units, as a string). */
  typed: string;
  /** All the biller's sales that day (minor units). */
  total: string;
}

export function parseCards(json: string | null | undefined): CardCounts | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== "object") return null;
    const out: CardCounts = {};
    for (const [k, n] of Object.entries(v)) if (/^\d+$/.test(k) && Number.isInteger(n) && (n as number) > 0) out[k] = n as number;
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** The kyat the cards add up to. */
export function cardsTotal(cards: CardCounts): bigint {
  return Object.entries(cards).reduce((a, [k, n]) => a + BigInt(k) * BigInt(n), 0n);
}

export function tallyCards(sales: { billerId: string; billerName: string; cards: CardCounts | null; faceAmount: bigint }[]): CardTally[] {
  const by = new Map<string, { name: string; cards: Map<number, number>; typed: bigint; total: bigint }>();
  for (const s of sales) {
    const row = by.get(s.billerId) ?? { name: s.billerName, cards: new Map(), typed: 0n, total: 0n };
    row.total += s.faceAmount;
    if (s.cards) for (const [k, n] of Object.entries(s.cards)) row.cards.set(Number(k), (row.cards.get(Number(k)) ?? 0) + n);
    else row.typed += s.faceAmount;
    by.set(s.billerId, row);
  }
  return [...by.entries()]
    .map(([billerId, r]) => ({
      billerId, billerName: r.name,
      cards: [...r.cards.entries()].sort((a, b) => a[0] - b[0]).map(([amount, count]) => ({ amount, count })),
      typed: r.typed.toString(), total: r.total.toString(),
    }))
    .sort((a, b) => a.billerName.localeCompare(b.billerName));
}

/** Cards a biller has on hand: the last count (if any) plus cards bought, less cards sold,
 *  since that count. Movements are the trades that recorded cards, voided ones left out. */
export function cardsOnHand(
  count: { counts: CardCounts; at: string } | null,
  movements: { kind: string; cards: CardCounts | null; createdAt: Date }[]
): CardCounts {
  const out: CardCounts = { ...(count?.counts ?? {}) };
  const since = count ? Date.parse(count.at) : -Infinity;
  for (const m of movements) {
    if (!m.cards || m.createdAt.getTime() <= since) continue;
    const sign = m.kind === "TOPUP" ? 1 : m.kind === "SALE" ? -1 : 0;
    for (const [k, n] of Object.entries(m.cards)) out[k] = (out[k] ?? 0) + sign * n;
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

export const cardCountKey = (billerId: string) => `billerCardCount:${billerId}`;

export interface CardReportRow {
  billerId: string;
  billerName: string;
  /** Card face value in kyat. */
  amount: number;
  opening: number;
  bought: number;
  sold: number;
  closing: number;
  /** What the cards sold brought in, and the margin on them (minor units, as strings). */
  sales: string;
  profit: string;
  /** What one card cost by the biller's refill deal (minor units); set by the caller. */
  cost?: string;
}

/** What one card of `amount` kyat costs by the refill deal: a discount takes the percent off
 *  the face value, a bonus gives the percent extra float for the money (minor units). */
export function cardCost(amount: number, refillPercent: number, refillMode: string): bigint {
  const face = amount * 100;
  if (!refillPercent) return BigInt(face);
  return BigInt(Math.round(refillMode === "BONUS" ? face / (1 + refillPercent / 100) : face * (1 - refillPercent / 100)));
}

/** A day's card stock statement for one biller: per card, what was on hand when the day
 *  began, bought and sold during it, and left at the end, with the sales and margin of the
 *  cards sold. A sale's margin is shared between its cards by their value. */
export function cardReport(opts: {
  billerId: string;
  billerName: string;
  count: { counts: CardCounts; at: string } | null;
  movements: { kind: string; cards: CardCounts | null; createdAt: Date; faceAmount: bigint; profit: bigint }[];
  dayStart: Date;
  dayEnd: Date;
}): CardReportRow[] {
  const before = opts.movements.filter((m) => m.createdAt < opts.dayStart);
  const opening = cardsOnHand(opts.count, before);
  const since = opts.count ? Date.parse(opts.count.at) : -Infinity;
  const rows = new Map<number, { opening: number; bought: number; sold: number; sales: bigint; profit: bigint }>();
  const row = (amount: number) => {
    const r = rows.get(amount) ?? { opening: 0, bought: 0, sold: 0, sales: 0n, profit: 0n };
    rows.set(amount, r);
    return r;
  };
  for (const [k, n] of Object.entries(opening)) row(Number(k)).opening = n;
  for (const m of opts.movements) {
    if (!m.cards || m.createdAt < opts.dayStart || m.createdAt >= opts.dayEnd || m.createdAt.getTime() <= since) continue;
    for (const [k, n] of Object.entries(m.cards)) {
      const r = row(Number(k));
      if (m.kind === "TOPUP") r.bought += n;
      else if (m.kind === "SALE") {
        r.sold += n;
        const value = BigInt(k) * BigInt(n) * 100n;
        r.sales += value;
        if (m.faceAmount > 0n) r.profit += (m.profit * value) / m.faceAmount;
      }
    }
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([amount, r]) => ({
      billerId: opts.billerId, billerName: opts.billerName, amount,
      opening: r.opening, bought: r.bought, sold: r.sold, closing: r.opening + r.bought - r.sold,
      sales: r.sales.toString(), profit: r.profit.toString(),
    }))
    .filter((r) => r.opening || r.bought || r.sold || r.closing);
}

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

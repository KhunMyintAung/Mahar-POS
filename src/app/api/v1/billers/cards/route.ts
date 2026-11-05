import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cardsOnHand, parseCards, type CardCounts } from "@/lib/billerCards";

// The top-up card amounts a shop sells (10,000, 5,000, 3,000, 1,000…), shown as buttons
// when a top-up card is sold, so the counter taps the cards instead of typing the sum.
const KEY = "topupCardAmounts";
const DEFAULT_CARD_AMOUNTS = [1000, 3000, 5000, 10000];

async function read(businessId: string): Promise<number[]> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: KEY } } });
  if (!row) return DEFAULT_CARD_AMOUNTS;
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? list.filter((n): n is number => Number.isInteger(n) && n > 0) : DEFAULT_CARD_AMOUNTS;
  } catch {
    return DEFAULT_CARD_AMOUNTS;
  }
}

/** The card amounts, and each biller's cards on hand (last count + bought − sold since). */
export const GET = withAuth("biller.view", async ({ user }) => {
  const businessId = user.businessId;
  const [amounts, counts, moves] = await Promise.all([
    read(businessId),
    prisma.systemSetting.findMany({ where: { businessId, key: { startsWith: "billerCardCount:" } } }),
    prisma.billerTxn.findMany({
      where: { businessId, voidedAt: null, cards: { not: null }, kind: { in: ["SALE", "TOPUP"] } },
      select: { billerId: true, kind: true, cards: true, createdAt: true },
    }),
  ]);
  const countOf = new Map<string, { counts: CardCounts; at: string }>();
  for (const c of counts) {
    try {
      const v = JSON.parse(c.value) as { counts: CardCounts; at: string };
      countOf.set(c.key.slice("billerCardCount:".length), { counts: parseCards(JSON.stringify(v.counts)) ?? {}, at: v.at });
    } catch { /* a broken count is ignored */ }
  }
  const ids = new Set([...countOf.keys(), ...moves.map((m) => m.billerId)]);
  const onHand: Record<string, CardCounts> = {};
  for (const id of ids) {
    onHand[id] = cardsOnHand(countOf.get(id) ?? null, moves.filter((m) => m.billerId === id).map((m) => ({ kind: m.kind, cards: parseCards(m.cards), createdAt: m.createdAt })));
  }
  return json({ amounts, onHand, countedAt: Object.fromEntries([...countOf].map(([id, c]) => [id, c.at])) });
});

const schema = z.object({ amounts: z.array(z.number().int().positive().max(10_000_000)).max(12) });

export const PUT = withAuth("biller.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const amounts = [...new Set(body.amounts)].sort((a, b) => a - b);
  await prisma.systemSetting.upsert({
    where: { businessId_key: { businessId: user.businessId, key: KEY } },
    create: { businessId: user.businessId, key: KEY, value: JSON.stringify(amounts) },
    update: { value: JSON.stringify(amounts) },
  });
  return json({ amounts });
});

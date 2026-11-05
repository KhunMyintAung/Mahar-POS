import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dateRangeUtc, isValidBusinessDate, todayBusinessDate } from "@/lib/dates";
import { cardCost, cardReport, parseCards, type CardCounts, type CardReportRow } from "@/lib/billerCards";

/** The day's top-up card statement (?date=YYYY-MM-DD): for each card biller and card, what
 *  was on hand when the day began, bought, sold, left, and the sales and margin. */
export const GET = withAuth("biller.view", async ({ req, user }) => {
  const date = req.nextUrl.searchParams.get("date") || todayBusinessDate();
  if (!isValidBusinessDate(date)) throw new ApiError(422, "Invalid date");
  const range = dateRangeUtc(date);
  const businessId = user.businessId;
  const billers = await prisma.biller.findMany({
    where: { businessId, type: "TOPUP_CARD", deletedAt: null },
    select: { id: true, name: true, refillPercent: true, refillMode: true },
    orderBy: { name: "asc" },
  });
  const ids = billers.map((b) => b.id);
  const [counts, moves] = await Promise.all([
    prisma.systemSetting.findMany({ where: { businessId, key: { in: ids.map((id) => `billerCardCount:${id}`) } } }),
    prisma.billerTxn.findMany({
      where: { businessId, billerId: { in: ids }, voidedAt: null, cards: { not: null }, kind: { in: ["SALE", "TOPUP"] }, createdAt: { lt: range.lt } },
      select: { billerId: true, kind: true, cards: true, createdAt: true, faceAmount: true, profit: true },
    }),
  ]);
  const rows: CardReportRow[] = [];
  for (const b of billers) {
    let count: { counts: CardCounts; at: string } | null = null;
    const saved = counts.find((c) => c.key === `billerCardCount:${b.id}`);
    if (saved) {
      try {
        const v = JSON.parse(saved.value) as { counts: CardCounts; at: string };
        // A count made after this day says nothing about it.
        if (Date.parse(v.at) < range.lt.getTime()) count = { counts: parseCards(JSON.stringify(v.counts)) ?? {}, at: v.at };
      } catch { /* a broken count is ignored */ }
    }
    // The margin on a card is its face value less what it cost by the refill deal, plus any
    // commission the sale itself made.
    rows.push(...cardReport({
      billerId: b.id, billerName: b.name, count,
      movements: moves.filter((m) => m.billerId === b.id).map((m) => ({ ...m, cards: parseCards(m.cards) })),
      dayStart: range.gte, dayEnd: range.lt,
    }).map((r) => {
      const cost = cardCost(r.amount, b.refillPercent, b.refillMode);
      return { ...r, cost: cost.toString(), profit: (BigInt(r.profit) + BigInt(r.sold) * (BigInt(r.amount * 100) - cost)).toString() };
    }));
  }
  return json({ date, rows });
});

import { z } from "zod";
import { withAuth, json, parseBody, pagination, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { dateRangeUtc, isValidBusinessDate, todayBusinessDate } from "@/lib/dates";
import { otherDayProblem } from "@/lib/backdate";
import { BILLER_TXN_KINDS, recordBillerTxn } from "@/services/billerService";
import { cardsTotal, parseCards, tallyCards } from "@/lib/billerCards";

export const GET = withAuth("biller.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const billerId = sp.get("billerId");
  const kind = sp.get("kind");
  const date = sp.get("date");

  const where = {
    businessId: user.businessId,
    ...branchScope(user),
    ...(billerId ? { billerId } : {}),
    ...(kind ? { kind } : {}),
    ...(date && isValidBusinessDate(date) ? { createdAt: dateRangeUtc(date) } : {}),
  };

  // The day's totals leave out voided movements, which no longer count for anything.
  const sums = await prisma.billerTxn.groupBy({
    by: ["kind"],
    where: { ...where, voidedAt: null },
    _sum: { faceAmount: true, cashAmount: true, profit: true },
    _count: true,
  });
  const pick = (k: string) => sums.find((s) => s.kind === k);
  const summary = {
    soldFace: (pick("SALE")?._sum.faceAmount ?? 0n).toString(),
    soldCash: (pick("SALE")?._sum.cashAmount ?? 0n).toString(),
    soldCount: pick("SALE")?._count ?? 0,
    refillFace: (pick("TOPUP")?._sum.faceAmount ?? 0n).toString(),
    refillCash: (pick("TOPUP")?._sum.cashAmount ?? 0n).toString(),
    refillCount: pick("TOPUP")?._count ?? 0,
    profit: sums.reduce((a, s) => a + (s._sum.profit ?? 0n), 0n).toString(),
  };

  // The day's sales by card, per biller, for counting the cards left: "Mytel 1,000 × 12".
  // Sales typed in by amount, not by card, are summed apart.
  const sold = await prisma.billerTxn.findMany({
    where: { ...where, voidedAt: null, kind: "SALE" },
    select: { billerId: true, cards: true, faceAmount: true, biller: { select: { name: true, type: true } } },
  });
  // Top-up card billers only: an e-load sale has no cards.
  const cards = tallyCards(sold.filter((t) => t.biller.type === "TOPUP_CARD").map((t) => ({ billerId: t.billerId, billerName: t.biller.name, cards: parseCards(t.cards), faceAmount: t.faceAmount })));

  const [txns, total] = await Promise.all([
    prisma.billerTxn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { biller: { select: { name: true, type: true, deletedAt: true } } },
    }),
    prisma.billerTxn.count({ where }),
  ]);

  return json({ txns, total, page, pageSize, summary: { ...summary, cards } });
});

const createSchema = z.object({
  billerId: z.string().min(1),
  kind: z.enum(BILLER_TXN_KINDS),
  // An adjustment carries its own sign, so a leading minus is allowed here.
  faceAmount: z.string().regex(/^-?\d+(\.\d+)?$/),
  cashAmount: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  commission: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  walletId: z.string().optional(),
  customerPhone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(300).optional(),
  // A day before today, for the owner or an admin entering a day's trades afterwards.
  date: z.string().refine(isValidBusinessDate).optional(),
  /** A sale made by tapping cards: how many of each card amount (in kyat). */
  cards: z.record(z.string().regex(/^\d+$/), z.number().int().min(1).max(10000)).optional(),
});

export const POST = withAuth("biller.trade", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);
  const today = todayBusinessDate();
  const dateProblem = body.date ? otherDayProblem(user.roleName, body.date, today) : null;
  if (dateProblem) throw new ApiError(403, dateProblem);

  const txn = await prisma.$transaction((tx) =>
    recordBillerTxn(tx, {
      businessId: user.businessId,
      userId: user.id,
      billerId: body.billerId,
      kind: body.kind,
      faceAmount: toMinor(body.faceAmount),
      cashAmount: toMinor(body.cashAmount),
      commission: toMinor(body.commission),
      walletId: body.walletId,
      customerPhone: body.customerPhone,
      note: body.note,
      date: body.date && body.date < today ? body.date : undefined,
    }).then(async (record) => {
      // Kept only when the cards make up the amount sold, so the count is never wrong.
      if ((body.kind !== "SALE" && body.kind !== "TOPUP") || !body.cards || cardsTotal(body.cards) * 100n !== toMinor(body.faceAmount)) return record;
      const biller = await tx.biller.findUnique({ where: { id: record.billerId }, select: { type: true } });
      if (biller?.type !== "TOPUP_CARD") return record;
      return tx.billerTxn.update({ where: { id: record.id }, data: { cards: JSON.stringify(body.cards) } });
    })
  );

  return json(txn, { status: 201 });
});

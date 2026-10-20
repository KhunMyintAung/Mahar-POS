import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { dateRangeUtc, isValidBusinessDate } from "@/lib/dates";
import { BILLER_TXN_KINDS, recordBillerTxn } from "@/services/billerService";

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

  return json({ txns, total, page, pageSize, summary });
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
});

export const POST = withAuth("biller.trade", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);

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
    })
  );

  return json(txn, { status: 201 });
});

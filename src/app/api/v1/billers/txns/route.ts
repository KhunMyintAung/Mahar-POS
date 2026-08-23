import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { BILLER_TXN_KINDS, recordBillerTxn } from "@/services/billerService";

export const GET = withAuth("biller.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const billerId = sp.get("billerId");
  const kind = sp.get("kind");

  const where = {
    businessId: user.businessId,
    ...branchScope(user),
    ...(billerId ? { billerId } : {}),
    ...(kind ? { kind } : {}),
  };

  const [txns, total] = await Promise.all([
    prisma.billerTxn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { biller: { select: { name: true, type: true } } },
    }),
    prisma.billerTxn.count({ where }),
  ]);

  return json({ txns, total, page, pageSize });
});

const createSchema = z.object({
  billerId: z.string().min(1),
  kind: z.enum(BILLER_TXN_KINDS),
  // An adjustment carries its own sign, so a leading minus is allowed here.
  faceAmount: z.string().regex(/^-?\d+(\.\d+)?$/),
  cashAmount: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
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
      walletId: body.walletId,
      customerPhone: body.customerPhone,
      note: body.note,
    })
  );

  return json(txn, { status: 201 });
});

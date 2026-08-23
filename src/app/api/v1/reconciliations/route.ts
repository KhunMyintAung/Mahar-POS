import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { todayBusinessDate } from "@/lib/dates";
import { audit } from "@/lib/audit";

export const GET = withAuth("wallet.view", async ({ req, user }) => {
  const { skip, take, page, pageSize } = pagination(req);
  const [items, total] = await Promise.all([
    prisma.walletReconciliation.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: "desc" },
      skip, take,
    }),
    prisma.walletReconciliation.count({ where: { businessId: user.businessId } }),
  ]);
  return json({ items, total, page, pageSize });
});

const schema = z.object({
  walletId: z.string().min(1),
  countedBalance: z.string().min(1),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("wallet.reconcile", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const wallet = await prisma.wallet.findUnique({ where: { id: body.walletId } });
  if (!wallet || wallet.businessId !== user.businessId) throw new ApiError(404, "Wallet not found");

  const counted = toMinor(body.countedBalance);
  const rec = await prisma.$transaction(async (tx) => {
    const r = await tx.walletReconciliation.create({
      data: {
        businessId: user.businessId,
        walletId: wallet.id,
        systemBalance: wallet.currentBalance,
        countedBalance: counted,
        difference: counted - wallet.currentBalance,
        date: body.date ?? todayBusinessDate(),
        notes: body.notes,
        reconciledById: user.id,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: wallet.branchId,
      action: "CREATE", module: "wallet", resourceType: "WalletReconciliation", resourceId: r.id,
      after: { system: wallet.currentBalance, counted, difference: r.difference },
    });
    return r;
  });
  return json(rec, { status: 201 });
});

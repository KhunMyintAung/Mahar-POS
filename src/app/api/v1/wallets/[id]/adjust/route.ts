import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { postLedger } from "@/services/walletService";
import { audit } from "@/lib/audit";

const schema = z.object({
  direction: z.enum(["DEBIT", "CREDIT"]),
  amount: z.string().min(1),
  reason: z.string().min(3, "A reason is required for adjustments"),
});

export const POST = withAuth("wallet.adjust", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const wallet = await prisma.wallet.findUnique({ where: { id: params.id } });
  if (!wallet || wallet.businessId !== user.businessId) throw new ApiError(404, "Wallet not found");
  if (wallet.branchId && !canAccessBranch(user, wallet.branchId))
    throw new ApiError(403, "No access to this branch");

  const amount = toMinor(body.amount);
  const result = await prisma.$transaction(async (tx) => {
    const r = await postLedger(tx, {
      businessId: user.businessId,
      walletId: wallet.id,
      direction: body.direction,
      amount,
      refType: "ADJUSTMENT",
      description: body.reason,
      createdById: user.id,
      allowNegative: true,
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: wallet.branchId,
      action: "ADJUST", module: "wallet", resourceType: "Wallet", resourceId: wallet.id,
      reason: body.reason,
      after: { direction: body.direction, amount },
    });
    return r;
  });
  return json(result.entry, { status: 201 });
});

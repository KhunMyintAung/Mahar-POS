import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";
import { cancelStockTransfer } from "@/services/stockTransferService";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required").max(300) });

// POST: cancel a transfer, sending its stock back to the branch it came from.
export const POST = withAuth("stock.adjust", async ({ req, user, params }) => {
  if (!user.permissions.includes("item.manage")) throw new ApiError(403, "You cannot move stock between branches");
  const body = await parseBody(req, schema);
  const t = await prisma.stockTransfer.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { fromBranchId: true, toBranchId: true } });
  if (!t) throw new ApiError(404, "Transfer not found");
  if (!canAccessBranch(user, t.fromBranchId) && !canAccessBranch(user, t.toBranchId)) throw new ApiError(403, "No access to this branch");
  const result = await prisma.$transaction((tx) =>
    cancelStockTransfer(tx, { businessId: user.businessId, userId: user.id, id: params.id, reason: body.reason })
  );
  return json(result);
});

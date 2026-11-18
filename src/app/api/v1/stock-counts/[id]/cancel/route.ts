import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";
import { cancelStockCount } from "@/services/stockCountService";

// POST: drop an open count; no stock changes.
export const POST = withAuth("stock.adjust", async ({ user, params }) => {
  if (!user.permissions.includes("item.manage")) throw new ApiError(403, "You cannot cancel a stock count");
  const count = await prisma.stockCount.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { branchId: true } });
  if (!count) throw new ApiError(404, "Stock count not found");
  if (!canAccessBranch(user, count.branchId)) throw new ApiError(403, "No access to this branch");
  const r = await prisma.$transaction((tx) => cancelStockCount(tx, { businessId: user.businessId, userId: user.id, id: params.id }));
  return json(r);
});

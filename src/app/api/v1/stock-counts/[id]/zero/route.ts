import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";
import { markUncountedZero } from "@/services/stockCountService";

// POST: every line not counted yet was looked for and not found: counted as 0.
export const POST = withAuth("stock.adjust", async ({ user, params }) => {
  const count = await prisma.stockCount.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { branchId: true } });
  if (!count) throw new ApiError(404, "Stock count not found");
  if (!canAccessBranch(user, count.branchId)) throw new ApiError(403, "No access to this branch");
  const marked = await prisma.$transaction((tx) => markUncountedZero(tx, { businessId: user.businessId, id: params.id }));
  return json({ marked });
});

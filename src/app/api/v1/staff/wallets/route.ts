import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";

/** The wallets salaries and advances can be paid from, for HR who may not see Wallets:
 *  names only, no balances. */
export const GET = withAuth("staff.manage", async ({ user }) => {
  const wallets = await prisma.wallet.findMany({
    where: { businessId: user.businessId, deletedAt: null, active: true, currency: "MMK", branchId: { not: null }, ...branchScope(user) },
    select: { id: true, name: true, currency: true, branchId: true, active: true },
    orderBy: { name: "asc" },
  });
  return json(wallets);
});

import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/onlineShop";

/** Orders from the Online Shop, newest first; ?status= narrows them. */
export const GET = withAuth("sale.view", async ({ req, user }) => {
  const status = req.nextUrl.searchParams.get("status");
  const orders = await prisma.onlineOrder.findMany({
    where: { businessId: user.businessId, ...(ORDER_STATUSES.includes(status as OrderStatus) ? { status: status as OrderStatus } : {}) },
    include: { lines: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const counts = await prisma.onlineOrder.groupBy({ by: ["status"], where: { businessId: user.businessId }, _count: { _all: true } });
  return json({ orders, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** Brands and models this shop has taken in before, most used first, for the intake form. */
export const GET = withAuth("repair.create", async ({ user }) => {
  const pairs = await prisma.repairJob.groupBy({
    by: ["deviceBrand", "deviceModel"],
    where: { businessId: user.businessId, deletedAt: null },
    _count: { _all: true },
    orderBy: { _count: { deviceModel: "desc" } },
    take: 300,
  });
  const brands = [...new Set(pairs.map((p) => p.deviceBrand.trim()).filter(Boolean))];
  return json({
    brands,
    pairs: pairs.map((p) => ({ brand: p.deviceBrand, model: p.deviceModel })),
  });
});

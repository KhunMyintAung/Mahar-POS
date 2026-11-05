import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";

// One purchase as a voucher: what came in, from whom, at what cost, and how it was paid.
// Opened from Purchases and from the "Stock purchase PUR-…" line in Income & Expense.
export const GET = withAuth("purchase.view", async ({ user, params }) => {
  const purchase = await prisma.purchase.findFirst({
    where: { id: params.id, businessId: user.businessId, deletedAt: null },
    include: { lines: { include: { item: { select: { name: true, sku: true } } } } },
  });
  if (!purchase || !canAccessBranch(user, purchase.branchId)) throw new ApiError(404, "Purchase not found");
  const [business, supplier, wallet, createdBy, serials] = await Promise.all([
    prisma.business.findUnique({ where: { id: user.businessId }, select: { name: true, phone: true, address: true } }),
    purchase.supplierId ? prisma.contact.findFirst({ where: { id: purchase.supplierId, businessId: user.businessId }, select: { name: true, phone: true } }) : null,
    purchase.walletId ? prisma.wallet.findFirst({ where: { id: purchase.walletId, businessId: user.businessId }, select: { name: true } }) : null,
    prisma.user.findUnique({ where: { id: purchase.createdById }, select: { name: true } }),
    prisma.itemSerial.findMany({ where: { businessId: user.businessId, purchaseId: purchase.id }, select: { itemId: true, imei: true }, orderBy: { imei: "asc" } }),
  ]);
  return json({
    ...purchase,
    lines: purchase.lines.map((l) => ({ ...l, imeis: serials.filter((s) => s.itemId === l.itemId).map((s) => s.imei) })),
    business,
    supplierName: supplier?.name ?? null,
    supplierPhone: supplier?.phone ?? null,
    walletName: wallet?.name ?? null,
    createdByName: createdBy?.name ?? null,
  });
});

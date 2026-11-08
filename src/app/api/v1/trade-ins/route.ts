import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";

/** Trade-in phones the shop holds but has not put on the shelf: waiting for QC, or in its
 *  own repair. With ?done=1, the ones checked in the last 30 days, for the record. */
export const GET = withAuth("purchase.view", async ({ req, user }) => {
  const done = req.nextUrl.searchParams.get("done") === "1";
  const purchases = await prisma.purchase.findMany({
    where: { businessId: user.businessId, deletedAt: null, tradeIn: true, status: "COMPLETED", ...branchScope(user) },
    select: { id: true, txnNo: true, date: true, supplierId: true, branchId: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const since = new Date(Date.now() - 30 * 86400_000);
  const serials = await prisma.itemSerial.findMany({
    where: {
      businessId: user.businessId, purchaseId: { in: purchases.map((p) => p.id) },
      ...(done ? { status: { notIn: ["QC", "IN_REPAIR"] }, qcAt: { gte: since } } : { status: { in: ["QC", "IN_REPAIR"] } }),
    },
    include: { item: { select: { name: true, model: true, sellingPrice: true } } },
    orderBy: { receivedAt: "desc" },
  });
  const sellerIds = [...new Set(purchases.map((p) => p.supplierId).filter(Boolean))] as string[];
  const jobIds = serials.map((s) => s.repairJobId).filter(Boolean) as string[];
  const [sellers, jobs] = await Promise.all([
    prisma.contact.findMany({ where: { businessId: user.businessId, id: { in: sellerIds } }, select: { id: true, name: true, phone: true } }),
    prisma.repairJob.findMany({
      where: { businessId: user.businessId, id: { in: jobIds } },
      select: { id: true, jobNo: true, status: true, problem: true, partsCost: true, laborCost: true, technicianName: true },
    }),
  ]);
  const purchaseOf = new Map(purchases.map((p) => [p.id, p]));
  const sellerOf = new Map(sellers.map((c) => [c.id, c]));
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  return json({
    phones: serials.map((s) => {
      const p = s.purchaseId ? purchaseOf.get(s.purchaseId) : undefined;
      const seller = p?.supplierId ? sellerOf.get(p.supplierId) : undefined;
      return {
        id: s.id, imei: s.imei, status: s.status, itemId: s.itemId, itemName: s.item.name, model: s.item.model,
        sellingPrice: s.item.sellingPrice, cost: s.cost, repairCost: s.repairCost, batteryHealth: s.batteryHealth,
        qcGrade: s.qcGrade, bodyCondition: s.bodyCondition,
        qcNote: s.qcNote, qcAt: s.qcAt, receivedAt: s.receivedAt,
        purchaseId: p?.id, purchaseNo: p?.txnNo, date: p?.date,
        sellerName: seller?.name ?? null, sellerPhone: seller?.phone ?? null,
        repair: s.repairJobId ? jobOf.get(s.repairJobId) ?? null : null,
      };
    }),
  });
});

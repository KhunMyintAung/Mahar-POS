import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { cleanImeis, normalizeImei, registerExistingSerials } from "@/services/serialService";

// IMEI / serial units of tracked items.
//   GET ?itemId=…[&branchId=…][&status=IN_STOCK]  the units of one item (POS picker, Stock)
//   GET ?q=…                                       find a unit by (part of) its IMEI
//   GET ?status=IN_STOCK[&branchId=…]              every unit on the shelf (the till)
//   POST { itemId, branchId, imeis }               record IMEIs for phones already in stock

export const GET = withAuth(null, async ({ req, user }) => {
  // The till picks IMEIs while selling, so a cashier without stock rights may read them.
  if (!can(user, "stock.view") && !can(user, "sale.create")) throw new ApiError(403, "Not allowed");
  const sp = req.nextUrl.searchParams;
  const q = normalizeImei(sp.get("q") ?? "");
  const itemId = sp.get("itemId");
  if (!q && !itemId && sp.get("status") !== "IN_STOCK") throw new ApiError(422, "Give an item or an IMEI to search for");

  const units = await prisma.itemSerial.findMany({
    where: {
      businessId: user.businessId,
      ...(itemId ? { itemId } : {}),
      ...(q ? { imei: { contains: q } } : {}),
      ...(sp.get("branchId") ? { branchId: sp.get("branchId")! } : {}),
      ...(sp.get("status") ? { status: sp.get("status")! } : {}),
    },
    include: { item: { select: { name: true, sku: true } } },
    orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
    take: q ? 30 : 1000,
  });

  // Where each unit went and where it came from, for the search results.
  const saleIds = [...new Set(units.map((u) => u.saleId).filter(Boolean))] as string[];
  const purchaseIds = [...new Set(units.map((u) => u.purchaseId).filter(Boolean))] as string[];
  const [sales, purchases] = await Promise.all([
    saleIds.length ? prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, txnNo: true, date: true, customerId: true } }) : [],
    purchaseIds.length ? prisma.purchase.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, txnNo: true, date: true } }) : [],
  ]);
  const customerIds = [...new Set(sales.map((s) => s.customerId).filter(Boolean))] as string[];
  const customers = customerIds.length ? await prisma.contact.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } }) : [];
  const saleById = new Map(sales.map((s) => [s.id, s]));
  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const customerById = new Map(customers.map((c) => [c.id, c.name]));

  return json({
    units: units.map((u) => {
      const sale = u.saleId ? saleById.get(u.saleId) : undefined;
      const purchase = u.purchaseId ? purchaseById.get(u.purchaseId) : undefined;
      return {
        id: u.id, imei: u.imei, status: u.status, itemId: u.itemId, itemName: u.item.name, sku: u.item.sku,
        branchId: u.branchId, receivedAt: u.receivedAt, soldAt: u.soldAt, notes: u.notes,
        sale: sale ? { txnNo: sale.txnNo, date: sale.date, customer: sale.customerId ? customerById.get(sale.customerId) ?? null : null } : null,
        purchase: purchase ? { txnNo: purchase.txnNo, date: purchase.date } : null,
      };
    }),
  });
});

const registerSchema = z.object({
  itemId: z.string().min(1),
  branchId: z.string().min(1),
  imeis: z.array(z.string().trim().max(40)).min(1).max(500),
});

export const POST = withAuth("stock.adjust", async ({ req, user }) => {
  const body = await parseBody(req, registerSchema);
  await assertBranchAccess(user, body.branchId);
  const item = await prisma.item.findFirst({ where: { id: body.itemId, businessId: user.businessId, deletedAt: null }, select: { trackSerial: true, name: true } });
  if (!item) throw new ApiError(404, "Item not found");
  if (!item.trackSerial) throw new ApiError(422, `${item.name} is not set to track IMEIs`);
  const imeis = cleanImeis(body.imeis);
  await prisma.$transaction(async (tx) => {
    await registerExistingSerials(tx, { businessId: user.businessId, branchId: body.branchId, itemId: body.itemId, imeis });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "CREATE", module: "stock", resourceType: "ItemSerial", resourceId: body.itemId,
      after: { item: item.name, registered: imeis.length },
    });
  });
  return json({ registered: imeis.length }, { status: 201 });
});

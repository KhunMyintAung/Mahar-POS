import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { moveStock } from "@/services/stockService";
import { audit } from "@/lib/audit";

// GET: stock levels (with item info); ?movements=1 returns recent movements instead.
export const GET = withAuth("stock.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("movements") === "1") {
    const movements = await prisma.stockMovement.findMany({
      where: {
        businessId: user.businessId,
        ...branchScope(user),
        ...(sp.get("itemId") ? { itemId: sp.get("itemId")! } : {}),
      },
      include: { item: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return json(movements);
  }

  const items = await prisma.item.findMany({
    where: { businessId: user.businessId, deletedAt: null },
    include: {
      stockLevels: true,
      unit: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const levels = items.map((it) => {
    const totalQty = it.stockLevels.reduce((a, l) => a + l.quantity, 0);
    return {
      itemId: it.id,
      name: it.name,
      sku: it.sku,
      unit: it.unit?.name,
      category: it.category?.name,
      minStock: it.minStock,
      costPrice: it.costPrice,
      sellingPrice: it.sellingPrice,
      totalQty,
      low: it.minStock > 0 && totalQty < it.minStock,
      byBranch: it.stockLevels,
    };
  });
  return json(levels);
});

const adjustSchema = z.object({
  itemId: z.string().min(1),
  branchId: z.string().min(1),
  quantity: z.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
  reason: z.string().trim().min(1, "A reason is required for stock adjustments"),
});

export const POST = withAuth("stock.adjust", async ({ req, user }) => {
  const body = await parseBody(req, adjustSchema);
  await assertBranchAccess(user, body.branchId);

  const result = await prisma.$transaction(async (tx) => {
    const r = await moveStock(tx, {
      businessId: user.businessId,
      itemId: body.itemId,
      branchId: body.branchId,
      type: "ADJUSTMENT",
      quantity: body.quantity,
      notes: body.reason,
      createdById: user.id,
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "ADJUST", module: "stock", resourceType: "Item", resourceId: body.itemId,
      reason: body.reason, after: { quantity: body.quantity, qtyAfter: r.qtyAfter },
    });
    return r;
  });
  return json({ qtyAfter: result.qtyAfter }, { status: 201 });
});

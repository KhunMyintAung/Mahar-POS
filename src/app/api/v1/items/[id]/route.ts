import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { correctProductName } from "@/lib/autoCorrect";
import { itemsWithStock } from "@/lib/itemStock";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { isPhoneShop } from "@/lib/modules";
import { EXPIRY_FORMAT_ERROR, EXPIRY_PATTERN, expiryDate } from "@/lib/expiry";

export const GET = withAuth("item.view", async ({ user, params }) => {
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: {
      category: true, unit: true, stockLevels: true,
      movements: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!item || item.businessId !== user.businessId || item.deletedAt)
    throw new ApiError(404, "Item not found");
  return json(item);
});

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  barcode: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  unitId: z.string().nullable().optional(),
  costPrice: z.string().optional(),
  sellingPrice: z.string().optional(),
  minStock: z.number().int().min(0).optional(),
  description: z.string().optional(),
  model: z.string().trim().max(120).transform((v) => (v === "" ? null : v)).nullable().optional(),
  variant: z.string().trim().max(80).transform((v) => (v === "" ? null : v)).nullable().optional(),
  active: z.boolean().optional(),
  trackSerial: z.boolean().optional(),
  /** False: unlimited quantity, no stock is counted. */
  trackStock: z.boolean().optional(),
  /** Best before (YYYY-MM-DD); empty clears it. */
  expiresAt: z.string().regex(EXPIRY_PATTERN, EXPIRY_FORMAT_ERROR).nullable().optional(),
  /** A second-hand phone: its condition (empty clears it), and battery health in %. */
  condition: z.string().trim().max(80).transform((v) => (v === "" ? null : v)).nullable().optional(),
  batteryHealth: z.number().int().min(0).max(100).nullable().optional(),
});

export const PATCH = withAuth("item.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const item = await prisma.item.findUnique({ where: { id: params.id } });
  if (!item || item.businessId !== user.businessId || item.deletedAt)
    throw new ApiError(404, "Item not found");

  // Phone words put right in a phone shop; any other shop's names get the basics only.
  const phoneShop = isPhoneShop(await loadModuleAccess(user.businessId));
  if (body.name) body.name = correctProductName(body.name, phoneShop);
  if (body.model) body.model = correctProductName(body.model, phoneShop);
  if (body.barcode) {
    body.barcode = body.barcode.trim();
    const taken = await prisma.item.findFirst({
      where: { businessId: user.businessId, barcode: body.barcode, deletedAt: null, id: { not: item.id } },
      select: { name: true },
    });
    if (taken) throw new ApiError(409, `This barcode is already on ${taken.name}`);
  }
  const { costPrice, sellingPrice, expiresAt, ...rest } = body;
  const updated = await prisma.$transaction(async (tx) => {
    if (body.categoryId) {
      const category = await tx.itemCategory.findFirst({
        where: { id: body.categoryId, businessId: user.businessId, active: true },
        select: { id: true },
      });
      if (!category) throw new ApiError(404, "Category not found");
    }
    if (body.unitId) {
      const unit = await tx.unit.findFirst({
        where: { id: body.unitId, businessId: user.businessId, active: true },
        select: { id: true },
      });
      if (!unit) throw new ApiError(404, "Unit not found");
    }
    // Goods on the shelf have a value in the books, so they cannot just stop being counted.
    if (body.trackStock === false && item.trackStock) {
      const [levels, phones] = await Promise.all([
        tx.stockLevel.findMany({ where: { itemId: item.id }, select: { quantity: true } }),
        tx.itemSerial.count({ where: { itemId: item.id, status: { notIn: ["SOLD", "REMOVED"] } } }),
      ]);
      const held = levels.find((l) => l.quantity !== 0)?.quantity ?? phones;
      if (held !== 0) throw new ApiError(422, `${item.name} still has ${held} in stock. Bring it to 0 with Adjust first.`);
    }
    const it = await tx.item.update({
      where: { id: item.id },
      data: {
        ...rest,
        ...((body.trackStock ?? item.trackStock) ? {} : { trackSerial: false, minStock: 0 }),
        ...(costPrice !== undefined ? { costPrice: toMinor(costPrice) } : {}),
        ...(sellingPrice !== undefined ? { sellingPrice: toMinor(sellingPrice) } : {}),
        ...(expiresAt !== undefined ? { expiresAt: expiryDate(expiresAt) } : {}),
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "item", resourceType: "Item", resourceId: it.id,
      before: { name: item.name, sellingPrice: item.sellingPrice }, after: body,
    });
    return it;
  });
  return json(updated);
});

export const DELETE = withAuth("item.manage", async ({ user, params }) => {
  const item = await prisma.item.findUnique({ where: { id: params.id } });
  if (!item || item.businessId !== user.businessId || item.deletedAt)
    throw new ApiError(404, "Item not found");
  await prisma.$transaction(async (tx) => {
    const [stocked] = await itemsWithStock(tx, [item.id]);
    if (stocked) throw new ApiError(422, `${item.name} still has ${stocked.quantity} in stock, so it cannot be deleted`);
    await tx.item.update({ where: { id: item.id }, data: { deletedAt: new Date(), active: false } });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "DELETE", module: "item", resourceType: "Item", resourceId: item.id,
      before: { name: item.name, sku: item.sku },
    });
  });
  return json({ deleted: true });
});

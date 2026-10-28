import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { autoCorrectName } from "@/lib/autoCorrect";
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
  /** Best before (YYYY-MM-DD); empty clears it. */
  expiresAt: z.string().regex(EXPIRY_PATTERN, EXPIRY_FORMAT_ERROR).nullable().optional(),
});

export const PATCH = withAuth("item.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const item = await prisma.item.findUnique({ where: { id: params.id } });
  if (!item || item.businessId !== user.businessId || item.deletedAt)
    throw new ApiError(404, "Item not found");

  // Phone names put right in a phone shop only; a mini mart's are kept as typed.
  if (isPhoneShop(await loadModuleAccess(user.businessId))) {
    if (body.name) body.name = autoCorrectName(body.name);
    if (body.model) body.model = autoCorrectName(body.model);
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
    const it = await tx.item.update({
      where: { id: item.id },
      data: {
        ...rest,
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

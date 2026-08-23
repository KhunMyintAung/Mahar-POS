import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { generateSku } from "@/lib/sku";
import { audit } from "@/lib/audit";

export const GET = withAuth("item.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 100);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...(sp.get("q")
      ? {
          OR: [
            { name: { contains: sp.get("q")! } },
            { sku: { contains: sp.get("q")! } },
            { barcode: { contains: sp.get("q")! } },
          ],
        }
      : {}),
    ...(sp.get("categoryId") ? { categoryId: sp.get("categoryId")! } : {}),
    ...(sp.get("active") === "1" ? { active: true } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true } },
        unit: { select: { name: true } },
        stockLevels: true,
      },
      orderBy: { name: "asc" },
      skip, take,
    }),
    prisma.item.count({ where }),
  ]);
  return json({ items, total, page, pageSize });
});

const schema = z.object({
  name: z.string().min(1),
  // Optional: a counter that does not keep product codes should not have to invent
  // one to save an item. Left empty, one is generated from the name.
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  unitId: z.string().optional(),
  costPrice: z.string().default("0"),
  sellingPrice: z.string().default("0"),
  minStock: z.number().int().min(0).default(0),
  description: z.string().optional(),
});

export const POST = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);

  const given = body.sku?.trim();
  const sku = given
    ? given
    : await generateSku(body.name, async (candidate) =>
        Boolean(
          await prisma.item.findUnique({
            where: { businessId_sku: { businessId: user.businessId, sku: candidate } },
            select: { id: true },
          })
        )
      );

  // Only a SKU the user typed can clash in a way worth reporting; a generated one was
  // checked for exactly that as it was made.
  if (given) {
    const dup = await prisma.item.findUnique({
      where: { businessId_sku: { businessId: user.businessId, sku } },
    });
    if (dup) throw new ApiError(422, `SKU ${sku} already exists`);
  }

  const item = await prisma.$transaction(async (tx) => {
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
    const it = await tx.item.create({
      data: {
        businessId: user.businessId,
        name: body.name,
        sku,
        barcode: body.barcode,
        categoryId: body.categoryId,
        unitId: body.unitId,
        costPrice: toMinor(body.costPrice),
        sellingPrice: toMinor(body.sellingPrice),
        minStock: body.minStock,
        description: body.description,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "item", resourceType: "Item", resourceId: it.id,
      after: { name: it.name, sku: it.sku },
    });
    return it;
  });
  return json(item, { status: 201 });
});

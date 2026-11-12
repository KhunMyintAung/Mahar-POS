import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { canSeeCost } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { generateSku } from "@/lib/sku";
import { audit } from "@/lib/audit";
import { correctProductName } from "@/lib/autoCorrect";
import { isPhoneCategory } from "@/lib/itemCategoryPresets";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { isPhoneShop } from "@/lib/modules";
import { EXPIRY_FORMAT_ERROR, EXPIRY_PATTERN, expiryDate } from "@/lib/expiry";
import { searchWords, wordForms } from "@/lib/searchWords";

export const GET = withAuth("item.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 100);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    // Word by word, in any order: "realme c15" finds "Oppo A15/A16k/Realme C12/C15/C11".
    ...(sp.get("q")?.trim()
      ? {
          // "note9" also as "note 9": a model number typed without its space still finds the item.
          AND: searchWords(sp.get("q")!).map((w) => ({
            OR: wordForms(w).flatMap((f) => [
              { name: { contains: f, mode: "insensitive" as const } },
              { sku: { contains: f, mode: "insensitive" as const } },
              { barcode: { contains: f, mode: "insensitive" as const } },
            ]),
          })),
        }
      : {}),
    ...(sp.get("categoryId") ? { categoryId: sp.get("categoryId")! } : {}),
    ...(sp.get("active") === "1" ? { active: true } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true, parentId: true } },
        unit: { select: { name: true } },
        stockLevels: true,
      },
      // Newest first: what was just added is what the shop is looking for.
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      skip, take,
    }),
    prisma.item.count({ where }),
  ]);
  // A sub-category comes with its category's name (Phone › Second), for the warranty at the till.
  const parentIds = [...new Set(items.map((i) => i.category?.parentId).filter((x): x is string => Boolean(x)))];
  const parents = parentIds.length
    ? new Map((await prisma.itemCategory.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]))
    : new Map<string, string>();
  const withParent = items.map((it) => (it.category?.parentId
    ? { ...it, category: { ...it.category, parentName: parents.get(it.category.parentId) ?? null } }
    : it));
  // A cashier or technician gets 0 for the cost price: the page shows "—" for them.
  const shown = canSeeCost(user.permissions) ? withParent : withParent.map((it) => ({ ...it, costPrice: 0n }));
  return json({ items: shown, total, page, pageSize });
});

const schema = z.object({
  name: z.string().trim().min(1),
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
  /** Variants: the model it belongs to ("iPhone 13") and what sets it apart ("128GB · Blue"). */
  model: z.string().trim().max(120).optional(),
  variant: z.string().trim().max(80).optional(),
  /** Keep an IMEI per unit. Left out, it is on for a phone shop's phones (Phone New / Phone Second). */
  trackSerial: z.boolean().optional(),
  /** False: unlimited quantity, no stock is counted. */
  trackStock: z.boolean().default(true),
  /** Best before (YYYY-MM-DD), for food and medicine; empty for none. */
  expiresAt: z.string().regex(EXPIRY_PATTERN, EXPIRY_FORMAT_ERROR).optional(),
  /** A second-hand phone: its condition, and battery health in %. */
  condition: z.string().trim().max(80).optional(),
  batteryHealth: z.number().int().min(0).max(100).nullable().optional(),
});

export const POST = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  // A phone shop's brand and model words are put right ("samsng a15" → "Samsung A15"); any
  // other shop's names get the basics only (capitals, spaces), so "500g" is not made a phone word.
  const phoneShop = isPhoneShop(await loadModuleAccess(user.businessId));
  body.name = correctProductName(body.name, phoneShop);
  if (body.model) body.model = correctProductName(body.model, phoneShop);
  const expiresAt = expiryDate(body.expiresAt);

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
    let categoryName = "";
    if (body.categoryId) {
      const category = await tx.itemCategory.findFirst({
        where: { id: body.categoryId, businessId: user.businessId, active: true },
        select: { id: true, name: true, parentId: true },
      });
      if (!category) throw new ApiError(404, "Category not found");
      // A sub-category reads with its category ("Phone New"), so Phone › New is a phone.
      const parent = category.parentId ? await tx.itemCategory.findUnique({ where: { id: category.parentId }, select: { name: true } }) : null;
      categoryName = parent ? `${parent.name} ${category.name}` : category.name;
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
        minStock: body.trackStock ? body.minStock : 0,
        description: body.description,
        model: body.model || null,
        variant: body.model ? body.variant || null : null,
        trackSerial: body.trackStock && (body.trackSerial ?? (phoneShop && isPhoneCategory(categoryName))),
        trackStock: body.trackStock,
        expiresAt,
        condition: body.condition || null,
        batteryHealth: body.batteryHealth ?? null,
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

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { generateSku } from "@/lib/sku";
import { parseProductCsv, type ParsedProduct } from "@/lib/productCsv";

/** Importing a product list.
 *
 *  Two steps on purpose. The preview says exactly what would happen — created, updated,
 *  rejected and why — and writes nothing; the commit repeats the same work and saves. A
 *  shop pasting two hundred rows out of its old system should see the damage before it is
 *  done, not afterwards.
 */

const schema = z.object({
  csv: z.string().min(1).max(2_000_000),
  /** False previews, true writes. Defaults to a preview: the harmless one is the default. */
  commit: z.boolean().default(false),
  branchId: z.string().optional(),
});

interface Planned {
  row: number;
  name: string;
  sku: string;
  action: "CREATE" | "UPDATE";
  sellingPrice: string;
  quantity: number;
}

export const POST = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const { products, rejected, unknownColumns } = parseProductCsv(body.csv);

  let branchId = body.branchId;
  if (!branchId) {
    const branch = await prisma.branch.findFirst({
      where: { businessId: user.businessId, active: true, ...branchScope(user) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!branch) throw new ApiError(422, "This business has no branch set up yet.");
    branchId = branch.id;
  }

  // Matched on SKU first, then barcode, then the exact name — the three ways the same
  // product can already be on file. Without the name check, a shop re-importing a list it
  // exported without codes would get a second copy of everything it owns.
  const existing = await prisma.item.findMany({
    where: { businessId: user.businessId, deletedAt: null },
    select: { id: true, name: true, sku: true, barcode: true },
  });
  const bySku = new Map(existing.map((it) => [it.sku.toLowerCase(), it]));
  const byBarcode = new Map(existing.filter((it) => it.barcode).map((it) => [it.barcode!.toLowerCase(), it]));
  const byName = new Map(existing.map((it) => [it.name.trim().toLowerCase(), it]));

  function match(product: ParsedProduct) {
    return (
      (product.sku && bySku.get(product.sku.toLowerCase())) ||
      (product.barcode && byBarcode.get(product.barcode.toLowerCase())) ||
      byName.get(product.name.trim().toLowerCase()) ||
      null
    );
  }

  const planned: Planned[] = products.map((product) => ({
    row: product.row,
    name: product.name,
    sku: product.sku || "(generated)",
    action: match(product) ? "UPDATE" : "CREATE",
    sellingPrice: product.sellingPrice,
    quantity: product.quantity,
  }));

  if (!body.commit) {
    return json({
      preview: true,
      willCreate: planned.filter((p) => p.action === "CREATE").length,
      willUpdate: planned.filter((p) => p.action === "UPDATE").length,
      planned,
      rejected,
      unknownColumns,
    });
  }

  const categoryIds = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const product of products) {
    const found = match(product);

    // Categories are made as they are met. A file naming a category the shop does not have
    // yet is the normal case on a first import, and stopping for it would be unhelpful.
    let categoryId: string | undefined;
    const categoryName = product.category.trim();
    if (categoryName) {
      const key = categoryName.toLowerCase();
      let id = categoryIds.get(key);
      if (!id) {
        const category =
          (await prisma.itemCategory.findFirst({
            where: { businessId: user.businessId, name: categoryName },
            select: { id: true },
          })) ??
          (await prisma.itemCategory.create({
            data: { businessId: user.businessId, name: categoryName },
            select: { id: true },
          }));
        id = category.id;
        categoryIds.set(key, id);
      }
      categoryId = id;
    }

    if (found) {
      await prisma.item.update({
        where: { id: found.id },
        data: {
          costPrice: toMinor(product.costPrice),
          sellingPrice: toMinor(product.sellingPrice),
          minStock: product.minStock,
          barcode: product.barcode || undefined,
          categoryId: categoryId ?? undefined,
        },
      });
      // Stock is set to what the file says, not added to it: the number in a stock-take
      // export is the count on the shelf, and adding would double it on a re-import.
      await prisma.stockLevel.upsert({
        where: { itemId_branchId: { itemId: found.id, branchId } },
        create: { itemId: found.id, branchId, quantity: product.quantity },
        update: { quantity: product.quantity },
      });
      updated += 1;
      continue;
    }

    const sku =
      product.sku ||
      (await generateSku(product.name, async (candidate) =>
        Boolean(
          await prisma.item.findUnique({
            where: { businessId_sku: { businessId: user.businessId, sku: candidate } },
            select: { id: true },
          })
        )
      ));

    const item = await prisma.item.create({
      data: {
        businessId: user.businessId,
        name: product.name,
        sku,
        barcode: product.barcode || undefined,
        categoryId,
        costPrice: toMinor(product.costPrice),
        sellingPrice: toMinor(product.sellingPrice),
        minStock: product.minStock,
      },
    });
    await prisma.stockLevel.create({
      data: { itemId: item.id, branchId, quantity: product.quantity },
    });
    // Kept in the maps so a file that names the same product twice under different codes
    // updates the row it just made rather than making another.
    bySku.set(sku.toLowerCase(), { ...item, barcode: item.barcode });
    byName.set(item.name.trim().toLowerCase(), { ...item, barcode: item.barcode });
    created += 1;
  }

  await prisma.$transaction(async (tx) => {
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      action: "IMPORT",
      module: "item",
      resourceType: "Item",
      after: { created, updated, rejected: rejected.length },
    });
  });

  return json({ preview: false, created, updated, rejected, unknownColumns });
});

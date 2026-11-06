import { correctProductName } from "@/lib/autoCorrect";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { isPhoneShop } from "@/lib/modules";
import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { generateSku } from "@/lib/sku";
import { CATEGORY_SEP, parseProductCsv, type ParsedProduct } from "@/lib/productCsv";
import { matchCategory, type CategoryLike } from "@/lib/categoryMatch";
import { assertBranchAccess } from "@/lib/tenant";
import { moveStock } from "@/services/stockService";

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
  /** Stock in the import branch now (0 for a new item), and what it will be. Equal when the
   *  file leaves the stock cell empty. */
  currentStock: number;
  quantity: number;
}

export const POST = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const { products, rejected, unknownColumns } = parseProductCsv(body.csv);
  // Names put right on the way in, as when typed in ("samsng a15" → "Samsung A15").
  const phoneShop = isPhoneShop(await loadModuleAccess(user.businessId));
  for (const p of products) p.name = correctProductName(p.name, phoneShop);

  let branchId = body.branchId;
  if (branchId) {
    await assertBranchAccess(user, branchId);
  } else {
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
    select: { id: true, name: true, sku: true, barcode: true, costPrice: true, sellingPrice: true, categoryId: true },
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

  // What each matched item holds in the import branch, so the preview can show the change.
  const stockNow = new Map(
    (await prisma.stockLevel.findMany({
      where: { branchId, item: { businessId: user.businessId } },
      select: { itemId: true, quantity: true },
    })).map((l) => [l.itemId, l.quantity])
  );

  const planned: Planned[] = products.map((product) => {
    const found = match(product);
    const currentStock = found ? stockNow.get(found.id) ?? 0 : 0;
    return {
      row: product.row,
      name: product.name,
      sku: found ? found.sku : product.sku || "(generated)",
      action: found ? "UPDATE" : "CREATE",
      // Empty when the row leaves the price as it is.
      sellingPrice: found && !product.given.sellingPrice ? "" : product.sellingPrice,
      currentStock,
      quantity: product.quantity ?? currentStock,
    };
  });

  // Categories: the shop's own, matched forgivingly (case, spaces, plurals, a slipped
  // letter), so "Accesory" in a file is the shop's "Accessory" and not a second one beside
  // it. Made only when nothing is close; one made here is matched by the rows after it too.
  const cats: (CategoryLike & { active: boolean })[] = await prisma.itemCategory.findMany({
    where: { businessId: user.businessId },
    select: { id: true, name: true, parentId: true, active: true },
  });
  const newIds = new Set<string>();
  const notes = new Map<string, { file: string; to: string; isNew: boolean }>();
  const labelOf = (c: CategoryLike) => {
    const parent = c.parentId ? cats.find((x) => x.id === c.parentId) : undefined;
    return parent ? `${parent.name}${CATEGORY_SEP}${c.name}` : c.name;
  };
  async function pick(name: string, parentId: string | null, anyLevel: boolean, write: boolean): Promise<CategoryLike> {
    const find = (list: typeof cats) =>
      matchCategory(name, list.filter((c) => c.parentId === parentId)) ??
      // A row with no sub-category may name one the shop has, as files from before did.
      (anyLevel ? matchCategory(name, list) : null);
    // The shop's list first; one it deleted comes back only when nothing on the list fits.
    const found = find(cats.filter((c) => c.active)) ?? find(cats.filter((c) => !c.active));
    if (found && !found.active) {
      if (write) await prisma.itemCategory.update({ where: { id: found.id }, data: { active: true } });
      found.active = true;
      newIds.add(found.id);
    }
    if (found) return found;
    const id = write
      ? (await prisma.itemCategory.create({ data: { businessId: user.businessId, name, parentId }, select: { id: true } })).id
      : `new:${cats.length}`;
    const made = { id, name, parentId, active: true };
    cats.push(made);
    newIds.add(id);
    return made;
  }
  async function categoryFor(product: ParsedProduct, write: boolean): Promise<string | undefined> {
    const name = product.category.trim();
    if (!name) return undefined;
    const parent = await pick(name, null, !product.subCategory, write);
    const leaf = product.subCategory ? await pick(product.subCategory, parent.id, false, write) : parent;
    const file = product.subCategory ? `${name}${CATEGORY_SEP}${product.subCategory}` : name;
    if (!notes.has(file.toLowerCase())) {
      notes.set(file.toLowerCase(), { file, to: labelOf(leaf), isNew: newIds.has(leaf.id) || newIds.has(parent.id) });
    }
    return leaf.id.startsWith("new:") ? undefined : leaf.id;
  }

  if (!body.commit) {
    for (const product of products) await categoryFor(product, false);
    return json({
      preview: true,
      willCreate: planned.filter((p) => p.action === "CREATE").length,
      willUpdate: planned.filter((p) => p.action === "UPDATE").length,
      planned,
      rejected,
      unknownColumns,
      // Only the ones worth a look: a name taken as an existing category under another
      // spelling, and the categories that will be made.
      categories: [...notes.values()].filter((n) => n.isNew || n.file.toLowerCase() !== n.to.toLowerCase()),
    });
  }

  const unitIds = new Map<string, string>();

  /** The id of the unit with this name (any case), made if the shop does not have it yet. */
  async function unitIdFor(name: string): Promise<string> {
    const key = name.toLowerCase();
    const cached = unitIds.get(key);
    if (cached) return cached;
    const existing = await prisma.unit.findFirst({
      where: { businessId: user.businessId, name: { equals: name, mode: "insensitive" } },
      select: { id: true, active: true },
    });
    if (existing && !existing.active) await prisma.unit.update({ where: { id: existing.id }, data: { active: true } });
    const id = existing?.id ?? (await prisma.unit.create({ data: { businessId: user.businessId, name }, select: { id: true } })).id;
    unitIds.set(key, id);
    return id;
  }
  // A new item with no unit in the file gets the shop's "pcs", the unit nearly everything is sold in.
  const defaultUnit = await prisma.unit.findFirst({
    where: { businessId: user.businessId, active: true, name: { equals: "pcs", mode: "insensitive" } },
    select: { id: true },
  });
  let created = 0;
  let updated = 0;
  // What the import did, item by item, for Audit Logs: the shop can see afterwards which
  // items were new and what a re-import changed (price, cost, stock, category).
  const LIST_MAX = 500;
  const newItems: string[] = [];
  const changed: { name: string; changes: { field: string; from: string; to: string }[] }[] = [];
  let unchanged = 0;
  const catName = (id: string | null | undefined) => {
    const c = id ? cats.find((x) => x.id === id) : undefined;
    return c ? labelOf(c) : "—";
  };

  for (const product of products) {
    const found = match(product);

    // Categories (and sub-categories under them) are made as they are met. A file naming a
    // category the shop does not have yet is the normal case on a first import, and
    // stopping for it would be unhelpful.
    const categoryId = await categoryFor(product, true);

    const unitId = product.unit ? await unitIdFor(product.unit) : undefined;

    if (found) {
      const changes: { field: string; from: string; to: string }[] = [];
      const cost = product.given.costPrice ? toMinor(product.costPrice) : null;
      const price = product.given.sellingPrice ? toMinor(product.sellingPrice) : null;
      if (cost !== null && cost !== found.costPrice) changes.push({ field: "cost", from: String(found.costPrice), to: String(cost) });
      if (price !== null && price !== found.sellingPrice) changes.push({ field: "price", from: String(found.sellingPrice), to: String(price) });
      if (categoryId && categoryId !== found.categoryId) changes.push({ field: "category", from: catName(found.categoryId), to: catName(categoryId) });
      const stockBefore = stockNow.get(found.id) ?? 0;
      if (product.quantity !== null && product.quantity !== stockBefore) changes.push({ field: "stock", from: String(stockBefore), to: String(product.quantity) });
      if (changes.length === 0) unchanged += 1;
      else if (changed.length < LIST_MAX) changed.push({ name: found.name, changes });
      if (cost !== null) found.costPrice = cost;
      if (price !== null) found.sellingPrice = price;
      if (categoryId) found.categoryId = categoryId;
      await prisma.item.update({
        where: { id: found.id },
        data: {
          ...(product.given.costPrice ? { costPrice: toMinor(product.costPrice) } : {}),
          ...(product.given.sellingPrice ? { sellingPrice: toMinor(product.sellingPrice) } : {}),
          ...(product.given.minStock ? { minStock: product.minStock } : {}),
          ...(product.expiresAt ? { expiresAt: new Date(`${product.expiresAt}T00:00:00Z`) } : {}),
          barcode: product.barcode || undefined,
          categoryId: categoryId ?? undefined,
          unitId: unitId ?? undefined,
        },
      });
      // Stock is set to what the file says, not added to it: the number in a stock-take
      // export is the count on the shelf, and adding would double it on a re-import. It is
      // moved by the difference, so the change shows in Stock movements like any other.
      if (product.quantity !== null) {
        const target = product.quantity;
        // Read inside the transaction, so a sale made while the file was going in is not undone.
        await prisma.$transaction(async (tx) => {
          const level = await tx.stockLevel.findUnique({ where: { itemId_branchId: { itemId: found.id, branchId } }, select: { quantity: true } });
          const now = level?.quantity ?? 0;
          if (target === now) return;
          await moveStock(tx, {
            businessId: user.businessId,
            itemId: found.id,
            branchId,
            type: "IMPORT",
            quantity: target - now,
            notes: `CSV import: stock set to ${target}`,
            createdById: user.id,
            allowNegative: true,
          });
        });
        stockNow.set(found.id, target);
      }
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
        unitId: unitId ?? defaultUnit?.id,
        costPrice: toMinor(product.costPrice),
        sellingPrice: toMinor(product.sellingPrice),
        minStock: product.minStock,
        expiresAt: product.expiresAt ? new Date(`${product.expiresAt}T00:00:00Z`) : undefined,
      },
    });
    if (product.quantity) {
      const opening = product.quantity;
      await prisma.$transaction((tx) => moveStock(tx, {
        businessId: user.businessId,
        itemId: item.id,
        branchId,
        type: "IMPORT",
        quantity: opening,
        notes: "CSV import: opening stock",
        createdById: user.id,
      }));
    } else {
      await prisma.stockLevel.create({ data: { itemId: item.id, branchId, quantity: 0 } });
    }
    stockNow.set(item.id, product.quantity ?? 0);
    if (newItems.length < LIST_MAX) newItems.push(item.name);
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
      after: {
        created,
        updated,
        unchanged,
        rejected: rejected.length,
        newItems,
        changed,
        newCategories: [...notes.values()].filter((n) => n.isNew).map((n) => n.to),
      },
    });
  });

  return json({ preview: false, created, updated, rejected, unknownColumns });
});

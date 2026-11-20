import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { moveStock } from "@/services/stockService";
import { cleanImeis, receiveSerials, removeSerials } from "@/services/serialService";
import { countReasonLabel } from "@/lib/stockCountReasons";

/** A stock count (stocktake), done the standard way: the books are the list. Every item the
 *  books hold for the branch (or one category) is a line, so an item that is in the books but
 *  not on the shelf shows up as "not counted" or as a shortage — it cannot be missed the way it
 *  is when the shelf is read against the books. Finishing it moves each counted item's stock
 *  to what was found (a STOCK_COUNT movement) and its IMEIs with it; lines left uncounted
 *  are not touched. */

/** One open count per branch, so two counts never correct the same shelf twice. */
export async function startStockCount(
  tx: Tx,
  opts: { businessId: string; userId: string; branchId: string; categoryId?: string | null; notes?: string | null }
) {
  const branch = await tx.branch.findFirst({ where: { id: opts.branchId, businessId: opts.businessId, active: true }, select: { id: true, name: true } });
  if (!branch) throw new ApiError(404, "Branch not found");
  const open = await tx.stockCount.findFirst({ where: { businessId: opts.businessId, branchId: branch.id, status: "OPEN" }, select: { txnNo: true } });
  if (open) throw new ApiError(422, `${open.txnNo} is still open for this branch. Finish or cancel it first.`);

  // A category counts with its sub-categories (Spare Parts › LCD, › Battery…).
  let categoryIds: string[] | null = null;
  let categoryName: string | null = null;
  if (opts.categoryId) {
    const cat = await tx.itemCategory.findFirst({ where: { id: opts.categoryId, businessId: opts.businessId }, select: { id: true, name: true } });
    if (!cat) throw new ApiError(404, "Category not found");
    const subs = await tx.itemCategory.findMany({ where: { businessId: opts.businessId, parentId: cat.id }, select: { id: true } });
    categoryIds = [cat.id, ...subs.map((s) => s.id)];
    categoryName = cat.name;
  }

  const items = await tx.item.findMany({
    where: {
      businessId: opts.businessId, deletedAt: null, active: true, trackStock: true,
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    },
    select: { id: true, stockLevels: { where: { branchId: branch.id }, select: { quantity: true } } },
  });
  if (items.length === 0) throw new ApiError(422, "There are no items with stock to count here");

  const txnNo = await nextNumber(tx, opts.businessId, "STOCK_COUNT");
  const count = await tx.stockCount.create({
    data: {
      businessId: opts.businessId, txnNo, branchId: branch.id,
      categoryId: opts.categoryId || null, categoryName, notes: opts.notes?.trim() || null, createdById: opts.userId,
    },
  });
  await tx.stockCountLine.createMany({
    data: items.map((it) => ({ countId: count.id, itemId: it.id, expectedQty: it.stockLevels[0]?.quantity ?? 0 })),
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: branch.id,
    action: "CREATE", module: "stock", resourceType: "StockCount", resourceId: count.id,
    after: { txnNo, branch: branch.name, category: categoryName, items: items.length },
  });
  return { id: count.id, txnNo };
}

async function openCount(tx: Tx, businessId: string, id: string) {
  const count = await tx.stockCount.findFirst({ where: { id, businessId } });
  if (!count) throw new ApiError(404, "Stock count not found");
  if (count.status !== "OPEN") throw new ApiError(422, `${count.txnNo} is already ${count.status === "COMPLETED" ? "finished" : "cancelled"}`);
  return count;
}

export interface CountEntry {
  itemId: string;
  /** Null clears the line back to "not counted"; left out, the count is not touched (a reason-only save). */
  countedQty?: number | null;
  /** IMEI-tracked items: the numbers found; the count is how many there are. */
  imeis?: string[];
  /** Why the count differs from the books; null clears it, left out keeps what is there. */
  reason?: string | null;
}

/** Saves what was found, a few lines at a time, so several people can count one shop. */
export async function saveCountEntries(tx: Tx, opts: { businessId: string; id: string; entries: CountEntry[] }) {
  const count = await openCount(tx, opts.businessId, opts.id);
  const lines = await tx.stockCountLine.findMany({
    where: { countId: count.id, itemId: { in: opts.entries.map((e) => e.itemId) } },
    include: { item: { select: { name: true, trackSerial: true } } },
  });
  const lineOf = new Map(lines.map((l) => [l.itemId, l]));
  const now = new Date();
  for (const e of opts.entries) {
    const line = lineOf.get(e.itemId);
    if (!line) throw new ApiError(404, "That item is not in this count");
    // A reason on its own: the figure counted stays as it is.
    if (e.countedQty === undefined) {
      if (e.reason !== undefined) await tx.stockCountLine.update({ where: { id: line.id }, data: { reason: e.reason } });
      continue;
    }
    if (e.countedQty === null) {
      // Back to "not counted" also drops its reason: there is nothing to explain yet.
      await tx.stockCountLine.update({ where: { id: line.id }, data: { countedQty: null, countedImeis: null, countedAt: null, reason: null } });
      continue;
    }
    const reasonPatch = e.reason !== undefined ? { reason: e.reason } : {};
    if (line.item.trackSerial) {
      const imeis = cleanImeis(e.imeis);
      // The same phone counted under another item of this count is a mistake on one of them.
      const elsewhere = imeis.length
        ? await tx.stockCountLine.findFirst({
            where: { countId: count.id, itemId: { not: line.itemId }, OR: imeis.map((i) => ({ countedImeis: { contains: i } })) },
            include: { item: { select: { name: true } } },
          })
        : null;
      if (elsewhere) {
        const dup = imeis.find((i) => elsewhere.countedImeis?.split(",").includes(i));
        if (dup) throw new ApiError(422, `IMEI ${dup} is already counted under ${elsewhere.item.name}`);
      }
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: { countedQty: imeis.length, countedImeis: imeis.join(",") || null, countedAt: now, ...reasonPatch },
      });
    } else {
      if (!Number.isInteger(e.countedQty) || e.countedQty < 0) throw new ApiError(422, `Enter how many ${line.item.name} were found (0 or more)`);
      await tx.stockCountLine.update({ where: { id: line.id }, data: { countedQty: e.countedQty, countedImeis: null, countedAt: now, ...reasonPatch } });
    }
  }
}

/** Every line not counted yet is marked as found 0 (searched for, not on the shelf). */
export async function markUncountedZero(tx: Tx, opts: { businessId: string; id: string }) {
  const count = await openCount(tx, opts.businessId, opts.id);
  const { count: n } = await tx.stockCountLine.updateMany({
    where: { countId: count.id, countedQty: null },
    data: { countedQty: 0, countedImeis: null, countedAt: new Date() },
  });
  return n;
}

/** Corrects the stock to what was counted. The difference is taken against the books as they
 *  stand now, so a sale made while counting is not counted twice; an IMEI phone's missing
 *  numbers are taken out and the ones found but not in the books are put in. */
export async function completeStockCount(tx: Tx, opts: { businessId: string; userId: string; id: string }) {
  const count = await openCount(tx, opts.businessId, opts.id);
  // Lock the count, so it is finished once even if the button is pressed twice.
  const { count: claimed } = await tx.stockCount.updateMany({
    where: { id: count.id, status: "OPEN" },
    data: { status: "COMPLETED", completedAt: new Date(), completedById: opts.userId },
  });
  if (claimed !== 1) throw new ApiError(422, `${count.txnNo} is already finished`);

  const lines = await tx.stockCountLine.findMany({
    where: { countId: count.id, countedQty: { not: null } },
    include: { item: { select: { id: true, name: true, costPrice: true, trackSerial: true, active: true, deletedAt: true } } },
  });
  if (lines.length === 0) throw new ApiError(422, "Nothing has been counted yet");

  let short = 0, over = 0;
  let shortValue = 0n, overValue = 0n;
  for (const line of lines) {
    if (line.item.deletedAt) continue;
    const level = await tx.stockLevel.findUnique({ where: { itemId_branchId: { itemId: line.itemId, branchId: count.branchId } }, select: { quantity: true } });
    const books = level?.quantity ?? 0;
    const counted = line.countedQty!;
    // The reason picked while counting goes into the movement's note, so the stock list says why.
    const why = countReasonLabel(line.reason);
    const notes = `${count.txnNo} — counted ${counted}, books ${books}${why ? ` — ${why}` : ""}`;

    if (line.item.trackSerial) {
      const found = line.countedImeis ? line.countedImeis.split(",") : [];
      const held = (await tx.itemSerial.findMany({
        where: { businessId: opts.businessId, itemId: line.itemId, branchId: count.branchId, status: "IN_STOCK" },
        select: { imei: true },
      })).map((s) => s.imei);
      const missing = held.filter((i) => !found.includes(i));
      const extra = found.filter((i) => !held.includes(i));
      if (missing.length) await removeSerials(tx, { businessId: opts.businessId, branchId: count.branchId, itemId: line.itemId, imeis: missing, notes: `${count.txnNo} — not found in stock count` });
      if (extra.length) {
        // A number the shop holds elsewhere (another item or branch) is a count mistake.
        const known = await tx.itemSerial.findFirst({
          where: { businessId: opts.businessId, imei: { in: extra }, status: "IN_STOCK" },
          include: { item: { select: { name: true } } },
        });
        if (known) throw new ApiError(422, `IMEI ${known.imei} is in stock as ${known.item.name}${known.branchId === count.branchId ? "" : " at another branch"}; check ${line.item.name}`);
        await receiveSerials(tx, { businessId: opts.businessId, branchId: count.branchId, itemId: line.itemId, imeis: extra, notes: `${count.txnNo} — found in stock count` });
      }
    }

    const diff = counted - books;
    if (diff !== 0) {
      await moveStock(tx, {
        businessId: opts.businessId, itemId: line.itemId, branchId: count.branchId,
        type: "STOCK_COUNT", quantity: diff, refType: "STOCK_COUNT", refId: count.id,
        notes, createdById: opts.userId, allowNegative: true, allowInactive: true,
      });
      if (diff < 0) { short += -diff; shortValue += line.item.costPrice * BigInt(-diff); }
      else { over += diff; overValue += line.item.costPrice * BigInt(diff); }
    }
    await tx.stockCountLine.update({
      where: { id: line.id },
      data: { expectedQty: books, adjustment: diff, unitCost: line.item.costPrice },
    });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: count.branchId,
    action: "COMPLETE", module: "stock", resourceType: "StockCount", resourceId: count.id,
    after: { txnNo: count.txnNo, counted: lines.length, short, over, shortValue: shortValue.toString(), overValue: overValue.toString() },
  });
  return { txnNo: count.txnNo, counted: lines.length, short, over, shortValue, overValue };
}

export async function cancelStockCount(tx: Tx, opts: { businessId: string; userId: string; id: string }) {
  const count = await openCount(tx, opts.businessId, opts.id);
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "CANCELLED", completedAt: new Date(), completedById: opts.userId } });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: count.branchId,
    action: "CANCEL", module: "stock", resourceType: "StockCount", resourceId: count.id, after: { txnNo: count.txnNo },
  });
  return { txnNo: count.txnNo };
}

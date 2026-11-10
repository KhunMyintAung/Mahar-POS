import type { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { moveStock } from "@/services/stockService";
import { cleanImeis, trackedItemIds } from "@/services/serialService";

// Stock sent from one branch to another. A transfer is one voucher (STR-000001): every line
// leaves the sending branch and arrives at the receiving one in the same transaction, so
// the shop's total stock and its value never change, only where the units sit. Cancelling
// sends everything back the same way.

export interface TransferLineInput { itemId: string; quantity: number; imeis?: string[] }

/** IMEI-tracked phones change branch with their stock: each must be on the shelf where it leaves. */
async function moveSerials(tx: Tx, businessId: string, itemId: string, imeis: string[], from: string, to: string) {
  for (const imei of imeis) {
    const u = await tx.itemSerial.findUnique({ where: { businessId_imei: { businessId, imei } } });
    if (!u || u.itemId !== itemId || u.branchId !== from || u.status !== "IN_STOCK") {
      throw new ApiError(422, `IMEI ${imei} is not on the shelf of the sending branch`);
    }
    await tx.itemSerial.update({ where: { id: u.id }, data: { branchId: to } });
  }
}

async function branchPair(tx: Tx, businessId: string, fromBranchId: string, toBranchId: string, allowInactive = false) {
  if (fromBranchId === toBranchId) throw new ApiError(422, "Choose two different branches");
  const branches = await tx.branch.findMany({
    where: { businessId, id: { in: [fromBranchId, toBranchId] }, ...(allowInactive ? {} : { active: true }) },
    select: { id: true, name: true },
  });
  const from = branches.find((b) => b.id === fromBranchId);
  const to = branches.find((b) => b.id === toBranchId);
  if (!from || !to) throw new ApiError(404, "Branch not found");
  return { from, to };
}

export async function createStockTransfer(
  tx: Tx,
  opts: { businessId: string; userId: string; fromBranchId: string; toBranchId: string; date: string; notes?: string; lines: TransferLineInput[] }
) {
  if (opts.lines.length === 0) throw new ApiError(422, "Add at least one item");
  const seen = new Set<string>();
  for (const l of opts.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new ApiError(422, "Quantity must be a whole number above 0");
    if (seen.has(l.itemId)) throw new ApiError(422, "An item is listed twice; put it on one line");
    seen.add(l.itemId);
  }
  const { from, to } = await branchPair(tx, opts.businessId, opts.fromBranchId, opts.toBranchId);
  const items = await tx.item.findMany({
    where: { businessId: opts.businessId, id: { in: [...seen] }, deletedAt: null },
    select: { id: true, name: true, costPrice: true, trackStock: true },
  });
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const tracked = await trackedItemIds(tx, opts.businessId, [...seen]);

  const txnNo = await nextNumber(tx, opts.businessId, "STOCK_TRANSFER");
  const transfer = await tx.stockTransfer.create({
    data: {
      businessId: opts.businessId, txnNo, fromBranchId: from.id, toBranchId: to.id, date: opts.date,
      notes: opts.notes?.trim() || null, createdById: opts.userId,
    },
  });

  for (const l of opts.lines) {
    const item = itemOf.get(l.itemId);
    if (!item) throw new ApiError(404, "Item not found");
    if (!item.trackStock) throw new ApiError(422, `${item.name} has unlimited quantity, so there is no stock to send`);
    let imeis: string[] = [];
    if (tracked.has(item.id)) {
      imeis = cleanImeis(l.imeis);
      if (imeis.length !== l.quantity) {
        throw new ApiError(422, `Pick the IMEI of each ${item.name} sent (${l.quantity} needed, ${imeis.length} given)`);
      }
      await moveSerials(tx, opts.businessId, item.id, imeis, from.id, to.id);
    }
    const ref = { businessId: opts.businessId, itemId: item.id, refType: "STOCK_TRANSFER", refId: transfer.id, createdById: opts.userId };
    await moveStock(tx, { ...ref, branchId: from.id, type: "TRANSFER_OUT", quantity: -l.quantity, notes: `${txnNo} to ${to.name}` });
    await moveStock(tx, { ...ref, branchId: to.id, type: "TRANSFER_IN", quantity: l.quantity, notes: `${txnNo} from ${from.name}` });
    await tx.stockTransferLine.create({
      data: { transferId: transfer.id, itemId: item.id, quantity: l.quantity, unitCost: item.costPrice, imeis: imeis.length ? imeis.join(",") : null },
    });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: from.id,
    action: "CREATE", module: "stock", resourceType: "StockTransfer", resourceId: transfer.id,
    after: { txnNo, from: from.name, to: to.name, lines: opts.lines.map((l) => ({ item: itemOf.get(l.itemId)?.name, quantity: l.quantity })) },
  });
  return { id: transfer.id, txnNo, from: from.name, to: to.name };
}

/** Send everything back: what arrived leaves the receiving branch (it must still be there)
 *  and returns to the sender. The voucher stays, marked cancelled. */
export async function cancelStockTransfer(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const t = await tx.stockTransfer.findFirst({ where: { id: opts.id, businessId: opts.businessId }, include: { lines: true } });
  if (!t) throw new ApiError(404, "Transfer not found");
  if (t.status !== "COMPLETED") throw new ApiError(422, `${t.txnNo} is already cancelled`);
  const { from, to } = await branchPair(tx, opts.businessId, t.fromBranchId, t.toBranchId, true);

  for (const l of t.lines) {
    const imeis = l.imeis ? l.imeis.split(",") : [];
    if (imeis.length) await moveSerials(tx, opts.businessId, l.itemId, imeis, to.id, from.id);
    const ref = { businessId: opts.businessId, itemId: l.itemId, refType: "STOCK_TRANSFER", refId: t.id, createdById: opts.userId, allowInactive: true };
    await moveStock(tx, { ...ref, branchId: to.id, type: "TRANSFER_OUT", quantity: -l.quantity, notes: `${t.txnNo} cancelled, back to ${from.name}` });
    await moveStock(tx, { ...ref, branchId: from.id, type: "TRANSFER_IN", quantity: l.quantity, notes: `${t.txnNo} cancelled, back from ${to.name}` });
  }
  await tx.stockTransfer.update({
    where: { id: t.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: opts.userId, cancelReason: opts.reason },
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: from.id,
    action: "CANCEL", module: "stock", resourceType: "StockTransfer", resourceId: t.id, reason: opts.reason,
    after: { txnNo: t.txnNo },
  });
  return { txnNo: t.txnNo };
}

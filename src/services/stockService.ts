import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

// The single choke point for stock quantity changes: every change writes a
// StockMovement alongside the StockLevel update, inside a DB transaction.

export async function moveStock(
  tx: Tx,
  opts: {
    businessId: string;
    itemId: string;
    branchId: string;
    type: string; // PURCHASE SALE ADJUSTMENT PURCHASE_RETURN SALE_RETURN TRANSFER_IN TRANSFER_OUT
    quantity: number; // signed: positive = stock in, negative = stock out
    refType?: string;
    refId?: string;
    notes?: string;
    createdById: string;
    allowNegative?: boolean;
    /** Putting back what an earlier sale or purchase moved: still allowed once the item
     *  or branch has been switched off since. */
    allowInactive?: boolean;
  }
) {
  if (!Number.isInteger(opts.quantity) || opts.quantity === 0)
    throw new ApiError(422, "Quantity must be a non-zero whole number");

  const item = await tx.item.findUnique({ where: { id: opts.itemId } });
  if (!item || item.businessId !== opts.businessId || item.deletedAt)
    throw new ApiError(404, "Item not found");
  if (!item.active && !opts.allowInactive) throw new ApiError(422, `Item ${item.name} is inactive`);
  const branch = await tx.branch.findFirst({
    where: { id: opts.branchId, businessId: opts.businessId, active: opts.allowInactive ? undefined : true },
    select: { id: true },
  });
  if (!branch) throw new ApiError(404, "Branch not found");
  // Unlimited quantity: nothing is counted, so nothing moves.
  if (item.trackStock === false) return { movement: null, qtyAfter: 0, item };

  const level = await tx.stockLevel.upsert({
    where: { itemId_branchId: { itemId: opts.itemId, branchId: opts.branchId } },
    create: { itemId: opts.itemId, branchId: opts.branchId, quantity: 0 },
    update: {},
  });

  // One UPDATE adds to whatever the row holds at that moment and keeps it locked until the
  // transaction ends. Reading the count and writing back count − 1 let two sales at the same
  // moment both start from the same number, and one of them was lost.
  const { quantity: qtyAfter } = await tx.stockLevel.update({
    where: { id: level.id },
    data: { quantity: { increment: opts.quantity } },
    select: { quantity: true },
  });
  // Throwing rolls the transaction back, the update with it.
  if (qtyAfter < 0 && !opts.allowNegative)
    throw new ApiError(422, `Insufficient stock for ${item.name} (have ${qtyAfter - opts.quantity}, need ${-opts.quantity})`);

  const movement = await tx.stockMovement.create({
    data: {
      businessId: opts.businessId,
      itemId: opts.itemId,
      branchId: opts.branchId,
      type: opts.type,
      quantity: opts.quantity,
      qtyAfter,
      refType: opts.refType,
      refId: opts.refId,
      notes: opts.notes,
      createdById: opts.createdById,
    },
  });
  return { movement, qtyAfter, item };
}

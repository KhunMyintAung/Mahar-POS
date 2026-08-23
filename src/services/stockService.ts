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
  }
) {
  if (!Number.isInteger(opts.quantity) || opts.quantity === 0)
    throw new ApiError(422, "Quantity must be a non-zero whole number");

  const item = await tx.item.findUnique({ where: { id: opts.itemId } });
  if (!item || item.businessId !== opts.businessId || item.deletedAt)
    throw new ApiError(404, "Item not found");
  if (!item.active) throw new ApiError(422, `Item ${item.name} is inactive`);
  const branch = await tx.branch.findFirst({
    where: { id: opts.branchId, businessId: opts.businessId, active: true },
    select: { id: true },
  });
  if (!branch) throw new ApiError(404, "Branch not found");

  const level = await tx.stockLevel.upsert({
    where: { itemId_branchId: { itemId: opts.itemId, branchId: opts.branchId } },
    create: { itemId: opts.itemId, branchId: opts.branchId, quantity: 0 },
    update: {},
  });

  const qtyAfter = level.quantity + opts.quantity;
  if (qtyAfter < 0 && !opts.allowNegative)
    throw new ApiError(422, `Insufficient stock for ${item.name} (have ${level.quantity}, need ${-opts.quantity})`);

  await tx.stockLevel.update({
    where: { id: level.id },
    data: { quantity: qtyAfter },
  });

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

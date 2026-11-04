import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { moveStock } from "./stockService";
import { randomUUID } from "crypto";
import { postLedger, reverseLedgerEntries } from "./walletService";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { assertDateOpen } from "./closeGuard";
import { cleanImeis, receiveSerials, releaseSaleSerials, removePurchaseSerials, sellSerials, trackedItemIds } from "./serialService";

// Purchases and sales tie inventory to the money system:
// - purchase: stock in; paid part leaves a wallet, unpaid part becomes a Payable
// - sale: stock out; paid part enters a wallet, unpaid part becomes a Receivable
// All amounts are BigInt minor units; quantities are whole units.

export interface LineInput {
  itemId: string;
  quantity: number;
  unitPrice: bigint; // unit cost for purchases, selling price for sales
  /** Sales only: the warranty given with this line, as printed, and its length in days. */
  warranty?: string;
  warrantyDays?: number;
  warrantyCondition?: "NEW" | "SECOND";
  /** Sales only: e.g. the IMEI, or what the customer traded in. */
  note?: string;
  /** For an IMEI-tracked item: one IMEI or serial per unit, bought or sold. */
  imeis?: string[];
  /** Sales only: goods the shop does not stock, fetched from another shop for this sale.
   *  `cost` is what that shop charges (its best price); itemId is then left empty. */
  outside?: { name: string; cost: bigint };
}

/** Items made for goods fetched from another shop carry this SKU prefix. They are kept out
 *  of every list (deleted from the start) and never hold stock; they exist so the sale line,
 *  its receipt and the reports name what was sold. */
export const OUTSIDE_SKU = "OUTSIDE-";

async function outsideItem(tx: Tx, businessId: string, name: string, cost: bigint) {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new ApiError(422, "Name the item fetched from the other shop");
  const found = await tx.item.findFirst({ where: { businessId, sku: { startsWith: OUTSIDE_SKU }, name: clean } });
  if (found) return tx.item.update({ where: { id: found.id }, data: { costPrice: cost } });
  return tx.item.create({
    data: {
      businessId, name: clean, sku: `${OUTSIDE_SKU}${randomUUID().slice(0, 8).toUpperCase()}`,
      costPrice: cost, active: false, deletedAt: new Date(),
      description: "Fetched from another shop for a sale; not stocked here.",
    },
  });
}

/** Each IMEI-tracked line must carry exactly one IMEI per unit; other lines carry none.
 *  Returns the cleaned IMEIs per line, in line order. */
async function imeisPerLine(tx: Tx, businessId: string, lines: LineInput[]): Promise<(string[] | null)[]> {
  const tracked = await trackedItemIds(tx, businessId, lines.map((l) => l.itemId));
  const seen = new Set<string>();
  return lines.map((l) => {
    if (!tracked.has(l.itemId)) return null;
    const imeis = cleanImeis(l.imeis);
    if (imeis.length !== l.quantity) {
      throw new ApiError(422, `Enter ${l.quantity} IMEI${l.quantity === 1 ? "" : "s"} for each phone on the line (got ${imeis.length})`);
    }
    for (const i of imeis) {
      if (seen.has(i)) throw new ApiError(422, `IMEI ${i} is on two lines`);
      seen.add(i);
    }
    return imeis;
  });
}

export function computeTotals(lines: { quantity: number; unitPrice: bigint }[], discount: bigint) {
  let subtotal = 0n;
  for (const l of lines) {
    if (l.quantity <= 0) throw new ApiError(422, "Line quantity must be positive");
    if (l.unitPrice < 0n) throw new ApiError(422, "Price cannot be negative");
    subtotal += BigInt(l.quantity) * l.unitPrice;
  }
  if (discount < 0n || discount > subtotal) throw new ApiError(422, "Invalid discount");
  return { subtotal, total: subtotal - discount };
}

export async function createPurchase(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    date: string;
    supplierId?: string;
    lines: LineInput[];
    discount: bigint;
    paidAmount: bigint;
    walletId?: string;
    dueDate?: string;
    reference?: string;
    notes?: string;
  }
) {
  if (opts.lines.length === 0) throw new ApiError(422, "A purchase needs at least one line");
  await assertDateOpen(tx, opts.branchId, opts.date);
  const branch = await tx.branch.findFirst({
    where: { id: opts.branchId, businessId: opts.businessId, active: true },
    select: { id: true },
  });
  if (!branch) throw new ApiError(404, "Branch not found");
  if (opts.supplierId) {
    const supplier = await tx.contact.findFirst({
      where: { id: opts.supplierId, businessId: opts.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) throw new ApiError(404, "Supplier not found");
  }
  const { subtotal, total } = computeTotals(opts.lines, opts.discount);
  if (opts.paidAmount < 0n || opts.paidAmount > total)
    throw new ApiError(422, "Paid amount cannot exceed the total");
  if (opts.paidAmount > 0n && !opts.walletId)
    throw new ApiError(422, "Select a wallet for the paid amount");
  const unpaid = total - opts.paidAmount;
  if (unpaid > 0n && !opts.supplierId)
    throw new ApiError(422, "A supplier is required for unpaid purchases");

  const txnNo = await nextNumber(tx, opts.businessId, "PURCHASE");
  const purchase = await tx.purchase.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      supplierId: opts.supplierId,
      subtotal,
      discount: opts.discount,
      total,
      paidAmount: opts.paidAmount,
      paymentStatus: unpaid === 0n ? "PAID" : opts.paidAmount > 0n ? "PARTIAL" : "UNPAID",
      walletId: opts.walletId,
      date: opts.date,
      reference: opts.reference,
      notes: opts.notes,
      createdById: opts.userId,
    },
  });

  const purchaseImeis = await imeisPerLine(tx, opts.businessId, opts.lines);
  for (const [i, l] of opts.lines.entries()) {
    await tx.purchaseLine.create({
      data: {
        purchaseId: purchase.id,
        itemId: l.itemId,
        quantity: l.quantity,
        unitCost: l.unitPrice,
        lineTotal: BigInt(l.quantity) * l.unitPrice,
      },
    });
    await moveStock(tx, {
      businessId: opts.businessId,
      itemId: l.itemId,
      branchId: opts.branchId,
      type: "PURCHASE",
      quantity: l.quantity,
      refType: "PURCHASE",
      refId: purchase.id,
      createdById: opts.userId,
    });
    const lineImeis = purchaseImeis[i];
    if (lineImeis) {
      await receiveSerials(tx, { businessId: opts.businessId, branchId: opts.branchId, itemId: l.itemId, imeis: lineImeis, purchaseId: purchase.id });
    }
    // Keep the item's latest cost price — but not from a free (FOC) line, which would
    // otherwise make a paid-for item look free in stock value and in every sale's profit.
    if (l.unitPrice > 0n) await tx.item.update({ where: { id: l.itemId }, data: { costPrice: l.unitPrice } });
  }

  if (opts.paidAmount > 0n && opts.walletId) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: opts.walletId,
      direction: "CREDIT",
      amount: opts.paidAmount,
      refType: "PURCHASE",
      refId: purchase.id,
      description: `${txnNo} purchase payment`,
      createdById: opts.userId,
    });
  }

  let payableId: string | undefined;
  if (unpaid > 0n && opts.supplierId) {
    const payTxnNo = await nextNumber(tx, opts.businessId, "PAYABLE");
    const payable = await tx.payable.create({
      data: {
        txnNo: payTxnNo,
        businessId: opts.businessId,
        branchId: opts.branchId,
        supplierId: opts.supplierId,
        originalAmount: unpaid,
        remainingAmount: unpaid,
        payableDate: opts.date,
        dueDate: opts.dueDate,
        category: "Purchase",
        reference: txnNo,
        notes: `Auto-created from purchase ${txnNo}`,
        createdById: opts.userId,
      },
    });
    payableId = payable.id;
    await tx.purchase.update({ where: { id: purchase.id }, data: { payableId } });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: opts.branchId,
    action: "CREATE", module: "purchase", resourceType: "Purchase", resourceId: purchase.id,
    after: { txnNo, total, paidAmount: opts.paidAmount, lines: opts.lines.length },
  });

  return { ...purchase, payableId };
}

export async function createSale(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    date: string;
    customerId?: string;
    lines: LineInput[];
    discount: bigint;
    paidAmount: bigint;
    walletId?: string;
    /** The received amount split across wallets; when absent it all goes to walletId. */
    payments?: { walletId: string; amount: bigint }[];
    /** For goods fetched from another shop (outside lines): paid now out of walletId, or
     *  owed to the shop named supplierName (a Payable). */
    outsidePay?: { walletId?: string; supplierName?: string };
    dueDate?: string;
    reference?: string;
    notes?: string;
  }
) {
  if (opts.lines.length === 0) throw new ApiError(422, "A sale needs at least one line");
  // Goods fetched from another shop get their hidden item first, so each line has an item.
  const outsideCost = opts.lines.reduce((a, l) => a + (l.outside ? BigInt(l.quantity) * l.outside.cost : 0n), 0n);
  for (const l of opts.lines) {
    if (!l.outside) continue;
    if (l.outside.cost < 0n) throw new ApiError(422, "The other shop's price cannot be negative");
    l.itemId = (await outsideItem(tx, opts.businessId, l.outside.name, l.outside.cost)).id;
  }
  if (outsideCost > 0n && !opts.outsidePay?.walletId && !opts.outsidePay?.supplierName?.trim())
    throw new ApiError(422, "Say how the other shop is paid: out of a wallet now, or owed to them");
  const payments = (opts.payments ?? []).filter((p) => p.amount > 0n);
  if (payments.length > 0) {
    const sum = payments.reduce((a, p) => a + p.amount, 0n);
    if (sum !== opts.paidAmount) throw new ApiError(422, "The split amounts must add up to the amount received");
    if (new Set(payments.map((p) => p.walletId)).size !== payments.length)
      throw new ApiError(422, "Choose a different wallet for each part of the payment");
  }
  const receipts = payments.length > 0
    ? payments
    : opts.paidAmount > 0n && opts.walletId ? [{ walletId: opts.walletId, amount: opts.paidAmount }] : [];
  await assertDateOpen(tx, opts.branchId, opts.date);
  const branch = await tx.branch.findFirst({
    where: { id: opts.branchId, businessId: opts.businessId, active: true },
    select: { id: true },
  });
  if (!branch) throw new ApiError(404, "Branch not found");
  if (opts.customerId) {
    const customer = await tx.contact.findFirst({
      where: { id: opts.customerId, businessId: opts.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new ApiError(404, "Customer not found");
  }
  const { subtotal, total } = computeTotals(opts.lines, opts.discount);
  if (opts.paidAmount < 0n || opts.paidAmount > total)
    throw new ApiError(422, "Paid amount cannot exceed the total");
  if (opts.paidAmount > 0n && receipts.length === 0)
    throw new ApiError(422, "Select a wallet for the received amount");
  const unpaid = total - opts.paidAmount;
  if (unpaid > 0n && !opts.customerId)
    throw new ApiError(422, "A customer is required for credit sales");

  const txnNo = await nextNumber(tx, opts.businessId, "SALE");
  const sale = await tx.sale.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      customerId: opts.customerId,
      subtotal,
      discount: opts.discount,
      total,
      paidAmount: opts.paidAmount,
      paymentStatus: unpaid === 0n ? "PAID" : opts.paidAmount > 0n ? "PARTIAL" : "UNPAID",
      walletId: receipts[0]?.walletId ?? opts.walletId,
      date: opts.date,
      reference: opts.reference,
      notes: opts.notes,
      createdById: opts.userId,
    },
  });

  let totalCost = 0n;
  // Kept as the lines are written so a caller can say what was sold without going back to
  // the database for it — the Telegram feed only reported a total, which told nobody what
  // had actually left the shelf.
  const soldItems: { name: string; quantity: number }[] = [];
  const saleImeis = await imeisPerLine(tx, opts.businessId, opts.lines);
  for (const [i, l] of opts.lines.entries()) {
    if (l.outside) {
      // Not stocked here: nothing leaves the shelf, and its cost is the other shop's price.
      soldItems.push({ name: l.outside.name.trim(), quantity: l.quantity });
      totalCost += BigInt(l.quantity) * l.outside.cost;
      await tx.saleLine.create({
        data: {
          saleId: sale.id, itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice, unitCost: l.outside.cost,
          lineTotal: BigInt(l.quantity) * l.unitPrice, note: l.note || null,
          // A phone fetched from another shop still goes out with the shop's warranty.
          warranty: l.warranty || null,
          warrantyDays: l.warranty ? Math.max(0, l.warrantyDays ?? 0) : 0,
          warrantyCondition: l.warranty ? l.warrantyCondition ?? null : null,
        },
      });
      continue;
    }
    const { item } = await moveStock(tx, {
      businessId: opts.businessId,
      itemId: l.itemId,
      branchId: opts.branchId,
      type: "SALE",
      quantity: -l.quantity,
      refType: "SALE",
      refId: sale.id,
      createdById: opts.userId,
    });
    soldItems.push({ name: item.name, quantity: l.quantity });
    totalCost += BigInt(l.quantity) * item.costPrice;
    const line = await tx.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: l.itemId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: item.costPrice,
        lineTotal: BigInt(l.quantity) * l.unitPrice,
        warranty: l.warranty || null,
        warrantyDays: l.warranty ? Math.max(0, l.warrantyDays ?? 0) : 0,
        warrantyCondition: l.warranty ? l.warrantyCondition ?? null : null,
        note: l.note || null,
      },
    });
    const lineImeis = saleImeis[i];
    if (lineImeis) {
      await sellSerials(tx, { businessId: opts.businessId, branchId: opts.branchId, itemId: l.itemId, imeis: lineImeis, saleId: sale.id, saleLineId: line.id });
    }
  }
  const profit = total - totalCost;
  await tx.sale.update({ where: { id: sale.id }, data: { totalCost, profit } });

  for (const r of receipts) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: r.walletId,
      direction: "DEBIT",
      amount: r.amount,
      refType: "SALE",
      refId: sale.id,
      description: receipts.length > 1 ? `${txnNo} sale receipt (split)` : `${txnNo} sale receipt`,
      createdById: opts.userId,
    });
  }

  // The other shop's money for goods fetched for this sale: paid now, or owed to them.
  if (outsideCost > 0n) {
    const supplierName = opts.outsidePay?.supplierName?.trim();
    if (opts.outsidePay?.walletId) {
      await postLedger(tx, {
        businessId: opts.businessId,
        walletId: opts.outsidePay.walletId,
        direction: "CREDIT",
        amount: outsideCost,
        refType: "OUTSIDE_COST",
        refId: sale.id,
        description: `${txnNo} paid to ${supplierName || "another shop"} for goods sold`,
        createdById: opts.userId,
      });
    } else if (supplierName) {
      const supplier = await tx.contact.findFirst({ where: { businessId: opts.businessId, type: "SUPPLIER", deletedAt: null, name: { equals: supplierName, mode: "insensitive" } } })
        ?? await tx.contact.create({ data: { businessId: opts.businessId, branchId: opts.branchId, name: supplierName.slice(0, 80), type: "SUPPLIER" } });
      const payable = await tx.payable.create({
        data: {
          txnNo: await nextNumber(tx, opts.businessId, "PAYABLE"),
          businessId: opts.businessId,
          branchId: opts.branchId,
          supplierId: supplier.id,
          reference: txnNo,
          originalAmount: outsideCost,
          remainingAmount: outsideCost,
          payableDate: opts.date,
          notes: `Goods fetched for sale ${txnNo}`,
          createdById: opts.userId,
        },
      });
      await tx.sale.update({ where: { id: sale.id }, data: { outsidePayableId: payable.id } });
    }
  }

  let receivableId: string | undefined;
  if (unpaid > 0n && opts.customerId) {
    const crdTxnNo = await nextNumber(tx, opts.businessId, "CREDIT");
    const receivable = await tx.receivable.create({
      data: {
        txnNo: crdTxnNo,
        businessId: opts.businessId,
        branchId: opts.branchId,
        customerId: opts.customerId,
        originalAmount: unpaid,
        remainingAmount: unpaid,
        creditDate: opts.date,
        dueDate: opts.dueDate,
        reference: txnNo,
        notes: `Auto-created from sale ${txnNo}`,
        createdById: opts.userId,
      },
    });
    receivableId = receivable.id;
    await tx.sale.update({ where: { id: sale.id }, data: { receivableId } });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: opts.branchId,
    action: "CREATE", module: "sale", resourceType: "Sale", resourceId: sale.id,
    after: { txnNo, total, paidAmount: opts.paidAmount, profit, lines: opts.lines.length },
  });

  return { ...sale, totalCost, profit, receivableId, soldItems };
}

/** Cancel a sale or purchase: reverse stock and wallet movements. Linked
 *  receivables/payables must be untouched (no payments) to cancel. */
export async function cancelSaleOrPurchase(
  tx: Tx,
  kind: "sale" | "purchase",
  opts: { id: string; reason: string; userId: string; businessId: string }
) {
  if (!opts.reason.trim()) throw new ApiError(422, "A reason is required");
  const record =
    kind === "sale"
      ? await tx.sale.findUnique({ where: { id: opts.id }, include: { lines: { include: { item: { select: { sku: true } } } } } })
      : await tx.purchase.findUnique({ where: { id: opts.id }, include: { lines: true } });
  if (!record || record.businessId !== opts.businessId) throw new ApiError(404, "Record not found");
  if (record.status === "CANCELLED") throw new ApiError(422, "Already cancelled");

  // IMEIs first: a purchase whose phone has since been sold cannot be cancelled.
  if (kind === "sale") await releaseSaleSerials(tx, record.id);
  else await removePurchaseSerials(tx, record.id);

  // reverse stock (goods fetched from another shop never came off a shelf here)
  for (const l of record.lines) {
    if ("item" in l && (l.item as { sku: string }).sku.startsWith(OUTSIDE_SKU)) continue;
    await moveStock(tx, {
      businessId: opts.businessId,
      itemId: l.itemId,
      branchId: record.branchId,
      type: kind === "sale" ? "SALE_RETURN" : "PURCHASE_RETURN",
      quantity: kind === "sale" ? l.quantity : -l.quantity,
      refType: kind === "sale" ? "SALE_CANCEL" : "PURCHASE_CANCEL",
      refId: record.id,
      notes: opts.reason,
      createdById: opts.userId,
      // A sale's goods come back, so it can always be cancelled. A purchase whose goods have
      // since been sold would leave the shelf below zero: that has to be sorted out first.
      allowNegative: kind === "sale",
      allowInactive: true,
    });
  }

  // Reverse the wallet movements. A split sale posted one receipt per wallet, so each one
  // is put back where it came from; older records fall back to the single wallet.
  const posted = kind === "sale"
    ? await tx.walletLedgerEntry.findMany({ where: { refType: "SALE", refId: record.id, direction: "DEBIT" } })
    : [];
  if (posted.length > 1) {
    for (const e of posted) {
      await postLedger(tx, {
        businessId: opts.businessId,
        walletId: e.walletId,
        direction: "CREDIT",
        amount: e.amount,
        refType: "REVERSAL",
        refId: record.id,
        description: `Cancel ${record.txnNo}: ${opts.reason}`,
        createdById: opts.userId,
        allowNegative: true,
      });
    }
  } else if (record.paidAmount > 0n && record.walletId) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: record.walletId,
      direction: kind === "sale" ? "CREDIT" : "DEBIT",
      amount: record.paidAmount,
      refType: "REVERSAL",
      refId: record.id,
      description: `Cancel ${record.txnNo}: ${opts.reason}`,
      createdById: opts.userId,
      allowNegative: true,
    });
  }

  // cancel the linked receivable/payable if untouched
  if (kind === "sale") {
    const s = record as typeof record & { receivableId?: string | null; outsidePayableId?: string | null };
    // What was paid to, or owed to, the other shop for goods fetched for this sale.
    await reverseLedgerEntries(tx, opts.businessId, "OUTSIDE_COST", record.id, opts.userId, opts.reason);
    if (s.outsidePayableId) {
      const owed = await tx.payable.findUnique({ where: { id: s.outsidePayableId } });
      if (owed && owed.paidAmount > 0n)
        throw new ApiError(422, "Cannot cancel: the other shop has already been paid part of what was owed");
      if (owed) await tx.payable.update({ where: { id: owed.id }, data: { status: "CANCELLED", remainingAmount: 0n } });
    }
    if (s.receivableId) {
      const rec = await tx.receivable.findUnique({ where: { id: s.receivableId } });
      if (rec && rec.paidAmount > 0n)
        throw new ApiError(422, "Cannot cancel: payments were already collected on the linked credit");
      if (rec) await tx.receivable.update({ where: { id: rec.id }, data: { status: "CANCELLED", remainingAmount: 0n } });
    }
    await tx.sale.update({ where: { id: record.id }, data: { status: "CANCELLED" } });
  } else {
    const p = record as typeof record & { payableId?: string | null };
    if (p.payableId) {
      const pay = await tx.payable.findUnique({ where: { id: p.payableId } });
      if (pay && pay.paidAmount > 0n)
        throw new ApiError(422, "Cannot cancel: payments were already made on the linked payable");
      if (pay) await tx.payable.update({ where: { id: pay.id }, data: { status: "CANCELLED", remainingAmount: 0n } });
    }
    await tx.purchase.update({ where: { id: record.id }, data: { status: "CANCELLED" } });
    await tx.incomeExpense.updateMany({ where: { businessId: opts.businessId, purchaseId: record.id, status: "COMPLETED" }, data: { status: "REVERSED" } });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: record.branchId,
    action: "REVERSE", module: kind, resourceType: kind === "sale" ? "Sale" : "Purchase",
    resourceId: record.id, reason: opts.reason,
    before: { txnNo: record.txnNo, total: record.total },
  });
}

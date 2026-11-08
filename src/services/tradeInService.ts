import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { averageCost } from "@/lib/costing";
import { businessDateOf } from "@/lib/dates";
import { ensureStandardCategories } from "@/lib/incomeCategories";
import { moveStock } from "./stockService";
import { createRepairJob } from "./repairService";
import { createIncomeExpenseEntry } from "./incomeExpenseService";

/** Second-hand phones bought from customers (trade-in).
 *
 *  A trade-in purchase brings each phone in as QC: owned by the shop, paid for, but not on
 *  the shelf. QC then routes it one of two ways:
 *   - Ready to sell → into stock at what was paid for it.
 *   - Needs repair → an internal repair job. Parts taken from stock for it and the repair
 *     fee are added to the phone's own cost, so the sale later shows the true profit.
 *  Only a phone in stock joins the item's average cost and its stock count. */

export const TRADE_IN_CUSTOMER = "Trade-in (shop)";

async function heldSerial(tx: Tx, businessId: string, serialId: string) {
  const s = await tx.itemSerial.findFirst({
    where: { id: serialId, businessId },
    include: { item: { select: { id: true, name: true, model: true } } },
  });
  if (!s) throw new ApiError(404, "Phone not found");
  return s;
}

/** The phone goes on the shelf: counted in stock, and its cost joins the item's average. */
async function putInStock(tx: Tx, opts: { businessId: string; userId: string; serialId: string; cost: bigint; note: string }) {
  const s = await tx.itemSerial.findUniqueOrThrow({ where: { id: opts.serialId } });
  const [onHand, item] = await Promise.all([
    tx.stockLevel.aggregate({ where: { itemId: s.itemId }, _sum: { quantity: true } }),
    tx.item.findUnique({ where: { id: s.itemId }, select: { costPrice: true } }),
  ]);
  await moveStock(tx, {
    businessId: opts.businessId, itemId: s.itemId, branchId: s.branchId, type: "TRADE_IN", quantity: 1,
    refType: "ItemSerial", refId: s.id, notes: opts.note, createdById: opts.userId, allowInactive: true,
  });
  const oldCost = item?.costPrice ?? 0n;
  const newCost = averageCost(onHand._sum.quantity ?? 0, oldCost, 1, opts.cost);
  if (newCost !== oldCost) await tx.item.update({ where: { id: s.itemId }, data: { costPrice: newCost } });
  await tx.itemSerial.update({ where: { id: s.id }, data: { status: "IN_STOCK", cost: opts.cost > 0n ? opts.cost : null } });
}

/** QC passed: the phone is ready to sell. */
export async function qcReady(tx: Tx, opts: {
  businessId: string; userId: string; serialId: string; batteryHealth?: number | null; note?: string | null;
  grade: string; bodyCondition: string;
}) {
  const s = await heldSerial(tx, opts.businessId, opts.serialId);
  if (s.status !== "QC") throw new ApiError(422, `IMEI ${s.imei} is not waiting for QC`);
  await tx.itemSerial.update({
    where: { id: s.id },
    data: { qcGrade: opts.grade, bodyCondition: opts.bodyCondition, batteryHealth: opts.batteryHealth ?? null, qcNote: opts.note?.trim() || null, qcAt: new Date() },
  });
  await putInStock(tx, { businessId: opts.businessId, userId: opts.userId, serialId: s.id, cost: s.cost ?? 0n, note: `QC passed · ${s.imei}` });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: s.branchId,
    action: "UPDATE", module: "stock", resourceType: "ItemSerial", resourceId: s.id,
    after: { imei: s.imei, qc: "READY", grade: opts.grade, body: opts.bodyCondition, batteryHealth: opts.batteryHealth ?? null },
  });
}

/** QC found a fault: the phone goes to the shop's own repair bench. */
export async function qcNeedsRepair(tx: Tx, opts: {
  businessId: string; userId: string; serialId: string; problem: string;
  batteryHealth?: number | null; note?: string | null; technicianName?: string | null;
  grade: string; bodyCondition: string;
}) {
  const s = await heldSerial(tx, opts.businessId, opts.serialId);
  if (s.status !== "QC") throw new ApiError(422, `IMEI ${s.imei} is not waiting for QC`);
  if (!opts.problem.trim()) throw new ApiError(422, "Say what needs repairing");
  const job = await createRepairJob(tx, {
    businessId: opts.businessId, branchId: s.branchId, userId: opts.userId,
    customerName: TRADE_IN_CUSTOMER,
    deviceBrand: s.item.name, deviceModel: s.item.model?.trim() || s.item.name,
    imei: s.imei, problem: opts.problem.trim(), estimatedCost: 0n, depositAmount: 0n,
    intakeCondition: `Grade ${opts.grade} · ${opts.bodyCondition}${opts.batteryHealth != null ? ` · Battery ${opts.batteryHealth}%` : ""}`,
    technicianName: opts.technicianName?.trim() || undefined,
    notes: opts.note?.trim() || undefined,
  });
  await tx.repairJob.update({ where: { id: job.id }, data: { serialId: s.id } });
  await tx.itemSerial.update({
    where: { id: s.id },
    data: {
      status: "IN_REPAIR", repairJobId: job.id, batteryHealth: opts.batteryHealth ?? null,
      qcGrade: opts.grade, bodyCondition: opts.bodyCondition,
      qcNote: opts.note?.trim() || null, qcAt: new Date(),
    },
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: s.branchId,
    action: "UPDATE", module: "stock", resourceType: "ItemSerial", resourceId: s.id,
    after: { imei: s.imei, qc: "REPAIR", repairJob: job.jobNo },
  });
  return job;
}

/** The repair is finished: parts used plus the repair fee go onto the phone's cost, a fee
 *  paid out now leaves its wallet as an expense, and the phone goes on the shelf. Its grade
 *  and body may be better now, so they can be given again. */
export async function finishTradeInRepair(tx: Tx, opts: {
  businessId: string; userId: string; serialId: string; laborCost: bigint; walletId?: string; note?: string | null;
  grade?: string; bodyCondition?: string;
}) {
  const s = await heldSerial(tx, opts.businessId, opts.serialId);
  if (s.status !== "IN_REPAIR" || !s.repairJobId) throw new ApiError(422, `IMEI ${s.imei} is not in repair`);
  if (opts.laborCost < 0n) throw new ApiError(422, "Amounts cannot be negative");
  const job = await tx.repairJob.findFirst({ where: { id: s.repairJobId, businessId: opts.businessId, deletedAt: null } });
  if (!job) throw new ApiError(404, "Repair job not found");
  if (job.status === "DELIVERED" || job.status === "CANCELLED") throw new ApiError(422, `${job.jobNo} is already closed`);

  if (opts.laborCost > 0n && opts.walletId) {
    await ensureStandardCategories(tx, opts.businessId);
    const category = await tx.category.findFirst({ where: { businessId: opts.businessId, type: "EXPENSE", systemKey: "DAILY_SALE" } });
    await createIncomeExpenseEntry(tx, {
      businessId: opts.businessId, branchId: s.branchId, userId: opts.userId, type: "EXPENSE",
      categoryName: category?.name ?? "Daily Sale Expense", amount: opts.laborCost, walletId: opts.walletId,
      date: businessDateOf(new Date()), reference: job.jobNo,
      description: `Repair fee for trade-in ${s.item.name} · ${s.imei}`,
    });
  }

  const repairCost = job.partsCost + opts.laborCost;
  const cost = (s.cost ?? 0n) + repairCost;
  const now = new Date();
  await tx.repairJob.update({
    where: { id: job.id },
    data: {
      laborCost: opts.laborCost, status: "DELIVERED", completedAt: job.completedAt ?? now, deliveredAt: now,
      notes: opts.note?.trim() ? [job.notes, opts.note.trim()].filter(Boolean).join("\n") : job.notes,
    },
  });
  await tx.itemSerial.update({
    where: { id: s.id },
    data: { repairCost, ...(opts.grade ? { qcGrade: opts.grade } : {}), ...(opts.bodyCondition ? { bodyCondition: opts.bodyCondition } : {}) },
  });
  await putInStock(tx, { businessId: opts.businessId, userId: opts.userId, serialId: s.id, cost, note: `Repaired (${job.jobNo}) · ${s.imei}` });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: s.branchId,
    action: "UPDATE", module: "stock", resourceType: "ItemSerial", resourceId: s.id,
    after: { imei: s.imei, repairJob: job.jobNo, partsCost: job.partsCost.toString(), laborCost: opts.laborCost.toString(), cost: cost.toString() },
  });
  return { repairCost, cost };
}

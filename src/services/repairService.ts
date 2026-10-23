import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { postLedger } from "./walletService";
import { BENCH_STATUSES, canMove, type RepairPriority, type RepairStatus } from "@/lib/repairStatus";
import { formatVoucherNo, parseRepairVoucherSettings, shopPrefix } from "@/lib/repairVoucherSettings";

export const REPAIR_VOUCHER_SETTING = "repair_voucher";

/** Repair jobs: a device in, a device out, and the money in between.
 *
 *  Nothing is charged while a phone is on the bench. A deposit taken at drop-off and the
 *  balance taken at collection are the only two moments money moves, and each posts to a
 *  wallet as it happens — so the drawer matches the job sheet without anyone reconciling.
 */

export { REPAIR_STATUSES, PRIORITIES, canMove } from "@/lib/repairStatus";
export type { RepairStatus, RepairPriority } from "@/lib/repairStatus";

/** How this shop numbers its repair vouchers: its own letters if it set any, otherwise the
 *  initials of its name, then a 4-digit count (MS0001). */
export async function voucherNumberFormat(tx: Tx, businessId: string) {
  const [row, business] = await Promise.all([
    tx.systemSetting.findUnique({ where: { businessId_key: { businessId, key: REPAIR_VOUCHER_SETTING } } }),
    tx.business.findUnique({ where: { id: businessId }, select: { name: true } }),
  ]);
  let settings = parseRepairVoucherSettings(undefined);
  try {
    if (row) settings = parseRepairVoucherSettings(JSON.parse(row.value));
  } catch {
    // A damaged setting numbers like a shop that never set one.
  }
  const prefix = settings.prefix || shopPrefix(business?.name ?? "");
  return (n: number) => formatVoucherNo(prefix, settings.digits, n);
}

export async function createRepairJob(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    deviceBrand: string;
    deviceModel: string;
    imei?: string;
    accessories?: string;
    problem: string;
    intakeCondition?: string;
    orderItems?: string;
    priority?: RepairPriority;
    estimatedCost: bigint;
    depositAmount: bigint;
    depositWalletId?: string;
    technicianId?: string;
    promisedAt?: Date;
    notes?: string;
  }
) {
  if (opts.estimatedCost < 0n || opts.depositAmount < 0n) {
    throw new ApiError(422, "Amounts cannot be negative");
  }
  if (opts.depositAmount > 0n && !opts.depositWalletId) {
    throw new ApiError(422, "Choose the wallet the deposit went into");
  }

  const jobNo = await nextNumber(tx, opts.businessId, "REPAIR", await voucherNumberFormat(tx, opts.businessId));
  const job = await tx.repairJob.create({
    data: {
      jobNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      customerId: opts.customerId,
      customerName: opts.customerName,
      customerPhone: opts.customerPhone,
      deviceBrand: opts.deviceBrand,
      deviceModel: opts.deviceModel,
      imei: opts.imei,
      accessories: opts.accessories,
      problem: opts.problem,
      intakeCondition: opts.intakeCondition,
      orderItems: opts.orderItems,
      priority: opts.priority ?? "NORMAL",
      estimatedCost: opts.estimatedCost,
      depositAmount: opts.depositAmount,
      paidAmount: opts.depositAmount,
      technicianId: opts.technicianId,
      promisedAt: opts.promisedAt,
      notes: opts.notes,
      createdById: opts.userId,
    },
  });

  // The deposit is real money in the drawer the moment it is taken, so it lands in the
  // wallet now rather than waiting for the repair to finish.
  if (opts.depositAmount > 0n && opts.depositWalletId) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: opts.depositWalletId,
      direction: "DEBIT",
      amount: opts.depositAmount,
      refType: "REPAIR_DEPOSIT",
      refId: job.id,
      description: `Repair deposit ${job.jobNo} - ${job.deviceBrand} ${job.deviceModel}`,
      createdById: opts.userId,
    });
  }

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: opts.branchId,
    action: "CREATE",
    module: "repair",
    resourceType: "RepairJob",
    resourceId: job.id,
    after: { jobNo: job.jobNo, device: `${job.deviceBrand} ${job.deviceModel}`, problem: job.problem },
  });
  return job;
}

/** What can be corrected on a job after intake. Money that has moved (deposit, payments)
 *  is not here: that is fixed by the wallet entries, not by editing the job. */
export interface RepairDetails {
  customerName?: string | null;
  customerPhone?: string | null;
  deviceBrand?: string;
  deviceModel?: string;
  imei?: string | null;
  accessories?: string | null;
  problem?: string;
  intakeCondition?: string | null;
  orderItems?: string | null;
  priority?: RepairPriority;
  estimatedCost?: bigint;
  promisedAt?: Date | null;
  notes?: string | null;
}

export async function updateRepairDetails(
  tx: Tx,
  opts: { businessId: string; userId: string; jobId: string; details: RepairDetails }
) {
  const job = await tx.repairJob.findFirst({
    where: { id: opts.jobId, businessId: opts.businessId, deletedAt: null },
  });
  if (!job) throw new ApiError(404, "Repair job not found");

  const d = opts.details;
  if (d.estimatedCost !== undefined) {
    if (d.estimatedCost < 0n) throw new ApiError(422, "Amounts cannot be negative");
    if (job.status === "DELIVERED" || job.status === "CANCELLED") {
      if (d.estimatedCost !== job.estimatedCost) {
        throw new ApiError(422, "The quote cannot change once the job is closed");
      }
    }
  }

  // Only what actually changed goes into the record and the audit trail.
  const changes: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(d) as [keyof RepairDetails, unknown][]) {
    if (value === undefined) continue;
    const current = job[key as keyof typeof job];
    const same = value instanceof Date && current instanceof Date
      ? value.getTime() === current.getTime()
      : value === current;
    if (same) continue;
    changes[key] = value;
    before[key] = typeof current === "bigint" ? current.toString() : current;
  }
  if (Object.keys(changes).length === 0) return job;

  const updated = await tx.repairJob.update({ where: { id: job.id }, data: changes });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: job.branchId,
    action: "UPDATE",
    module: "repair",
    resourceType: "RepairJob",
    resourceId: job.id,
    before,
    after: Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])
    ),
  });
  return updated;
}

/** Take the rest of the charge now, without waiting for the phone to be collected.
 *
 *  The same money handling as delivery: only the outstanding part posts to the wallet,
 *  because the deposit was banked at drop-off. Afterwards the job is settled and the
 *  voucher says so; delivering it later takes nothing more.
 */
export async function payRepairBalance(
  tx: Tx,
  opts: { businessId: string; userId: string; jobId: string; finalCost?: bigint; walletId?: string }
) {
  const job = await tx.repairJob.findFirst({
    where: { id: opts.jobId, businessId: opts.businessId, deletedAt: null },
  });
  if (!job) throw new ApiError(404, "Repair job not found");
  if (job.status === "CANCELLED") throw new ApiError(422, "A cancelled job cannot be paid");

  const finalCost = opts.finalCost ?? job.finalCost;
  if (finalCost <= 0n) throw new ApiError(422, "Set what the repair costs first");
  if (job.status === "DELIVERED" && finalCost !== job.finalCost) {
    throw new ApiError(422, "The charge cannot change once the phone has gone home");
  }
  if (finalCost < job.paidAmount) {
    throw new ApiError(422, "The charge is less than what has already been paid");
  }
  const balance = finalCost - job.paidAmount;
  if (balance > 0n && !opts.walletId) throw new ApiError(422, "Choose the wallet the money went into");

  if (balance > 0n && opts.walletId) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: opts.walletId,
      direction: "DEBIT",
      amount: balance,
      refType: "REPAIR_PAYMENT",
      refId: job.id,
      description: `Repair ${job.jobNo} - ${job.deviceBrand} ${job.deviceModel}`,
      createdById: opts.userId,
    });
  }

  const updated = await tx.repairJob.update({
    where: { id: job.id },
    data: { finalCost, paidAmount: finalCost },
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: job.branchId,
    action: "PAY",
    module: "repair",
    resourceType: "RepairJob",
    resourceId: job.id,
    before: { finalCost: job.finalCost.toString(), paidAmount: job.paidAmount.toString() },
    after: { finalCost: updated.finalCost.toString(), paidAmount: updated.paidAmount.toString(), collected: balance.toString() },
  });
  return updated;
}

/** Fully paid: a charge is set and nothing is left to collect. */
export function isSettled(job: { finalCost: bigint; paidAmount: bigint }): boolean {
  return job.finalCost > 0n && job.paidAmount >= job.finalCost;
}

export async function updateRepairStatus(
  tx: Tx,
  opts: {
    businessId: string;
    userId: string;
    jobId: string;
    status: RepairStatus;
    partsCost?: bigint;
    finalCost?: bigint;
    technicianId?: string;
    notes?: string;
    /** Where the balance is collected when the phone goes back out. */
    walletId?: string;
  }
) {
  const job = await tx.repairJob.findFirst({
    where: { id: opts.jobId, businessId: opts.businessId, deletedAt: null },
  });
  if (!job) throw new ApiError(404, "Repair job not found");
  if (job.status !== opts.status && !canMove(job.status, opts.status)) {
    throw new ApiError(422, `A ${job.status.toLowerCase()} job cannot become ${opts.status.toLowerCase()}`);
  }

  const finalCost = opts.finalCost ?? job.finalCost;
  const partsCost = opts.partsCost ?? job.partsCost;
  if (finalCost < 0n || partsCost < 0n) throw new ApiError(422, "Amounts cannot be negative");

  let paidAmount = job.paidAmount;
  const balance = finalCost - job.paidAmount;

  if (opts.status === "DELIVERED") {
    // A phone that could not be fixed may go back free; a repaired one needs its charge.
    if (finalCost <= 0n && job.status !== "CANNOT_REPAIR") {
      throw new ApiError(422, "Set what the repair cost before handing it back");
    }
    if (finalCost < job.paidAmount) {
      throw new ApiError(422, "The charge is less than the deposit already taken");
    }
    if (balance > 0n && !opts.walletId) {
      throw new ApiError(422, "Choose the wallet the balance was paid into");
    }
    // Only the outstanding part is taken now; the deposit was banked at drop-off, and
    // charging it twice is the mistake this guards against.
    if (balance > 0n && opts.walletId) {
      await postLedger(tx, {
        businessId: opts.businessId,
        walletId: opts.walletId,
        direction: "DEBIT",
        amount: balance,
        refType: "REPAIR_PAYMENT",
        refId: job.id,
        description: `Repair ${job.jobNo} - ${job.deviceBrand} ${job.deviceModel}`,
        createdById: opts.userId,
      });
      paidAmount = finalCost;
    }
  }

  const updated = await tx.repairJob.update({
    where: { id: job.id },
    data: {
      status: opts.status,
      partsCost,
      finalCost,
      paidAmount,
      technicianId: opts.technicianId ?? job.technicianId,
      notes: opts.notes ?? job.notes,
      // Reopening a job clears its finish time, so it is stamped afresh when it is really done.
      completedAt:
        opts.status === "DONE" || opts.status === "CANNOT_REPAIR"
          ? job.completedAt ?? new Date()
          : BENCH_STATUSES.includes(opts.status)
            ? null
            : job.completedAt,
      deliveredAt: opts.status === "DELIVERED" ? new Date() : job.deliveredAt,
    },
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: job.branchId,
    action: opts.status === "DELIVERED" ? "DELIVER" : "UPDATE",
    module: "repair",
    resourceType: "RepairJob",
    resourceId: job.id,
    before: { status: job.status, finalCost: job.finalCost.toString(), paidAmount: job.paidAmount.toString() },
    after: { status: updated.status, finalCost: updated.finalCost.toString(), paidAmount: updated.paidAmount.toString() },
  });
  return updated;
}

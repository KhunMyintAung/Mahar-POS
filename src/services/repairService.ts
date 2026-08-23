import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { postLedger } from "./walletService";

/** Repair jobs: a device in, a device out, and the money in between.
 *
 *  Nothing is charged while a phone is on the bench. A deposit taken at drop-off and the
 *  balance taken at collection are the only two moments money moves, and each posts to a
 *  wallet as it happens — so the drawer matches the job sheet without anyone reconciling.
 */

export const REPAIR_STATUSES = [
  "RECEIVED",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "DONE",
  "DELIVERED",
  "CANCELLED",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

/** Where a job may go next.
 *
 *  Written out rather than checked ad hoc: a phone that has gone back to its owner cannot
 *  return to the bench, and a cancelled job cannot quietly become a delivered one. Both
 *  would leave money booked against a job that never happened.
 */
const NEXT: Record<RepairStatus, RepairStatus[]> = {
  RECEIVED: ["IN_PROGRESS", "WAITING_PARTS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "DONE", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "DONE", "CANCELLED"],
  DONE: ["DELIVERED", "IN_PROGRESS", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canMove(from: string, to: string): boolean {
  const allowed = NEXT[from as RepairStatus];
  return Boolean(allowed?.includes(to as RepairStatus));
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

  const jobNo = await nextNumber(tx, opts.businessId, "REPAIR");
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
    if (finalCost <= 0n) throw new ApiError(422, "Set what the repair cost before handing it back");
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
      completedAt: opts.status === "DONE" && !job.completedAt ? new Date() : job.completedAt,
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

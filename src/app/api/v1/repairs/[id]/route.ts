import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { REPAIR_STATUSES, updateRepairStatus } from "@/services/repairService";
import { notifyAuditFeed, repairStatusNotice } from "@/lib/telegramNotify";

export const GET = withAuth("repair.view", async ({ user, params }) => {
  const job = await prisma.repairJob.findFirst({
    where: { id: params.id, businessId: user.businessId, deletedAt: null },
  });
  if (!job) throw new ApiError(404, "Repair job not found");
  return json(job);
});

const patchSchema = z.object({
  status: z.enum(REPAIR_STATUSES),
  partsCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  finalCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  technicianId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  walletId: z.string().optional(),
});

export const PATCH = withAuth("repair.update", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  // Handing a phone back takes its balance into a wallet; a technician, who cannot see
  // wallets, leaves that to the counter.
  if (body.status === "DELIVERED" && !user.permissions.includes("wallet.view")) {
    throw new ApiError(403, "You don't have permission for that.");
  }
  const before = await prisma.repairJob.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { status: true, paidAmount: true } });
  const job = await prisma.$transaction((tx) =>
    updateRepairStatus(tx, {
      businessId: user.businessId,
      userId: user.id,
      jobId: params.id,
      status: body.status,
      partsCost: body.partsCost === undefined ? undefined : toMinor(body.partsCost),
      finalCost: body.finalCost === undefined ? undefined : toMinor(body.finalCost),
      technicianId: body.technicianId,
      notes: body.notes,
      walletId: body.walletId,
    })
  );
  if (before && (before.status !== job.status || job.paidAmount !== before.paidAmount)) {
    notifyAuditFeed(user.businessId, repairStatusNotice({
      ...job, from: before.status, to: job.status, paidNow: job.paidAmount - before.paidAmount, createdByName: user.name, notes: body.notes,
    }), undefined, user.id);
  }
  return json(job);
});

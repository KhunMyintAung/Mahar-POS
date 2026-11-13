import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { REPAIR_STATUSES, deleteRepairJob, updateRepairStatus } from "@/services/repairService";
import { notifyAuditFeed, repairStatusNotice } from "@/lib/telegramNotify";
import { loadRepairFlow } from "@/services/repairProfitService";
import { after } from "next/server";
import { notifyRepairWatchers } from "@/lib/repairWatch";
import { isDuplicateOp, offlineAt, offlineOpSchema, priorOp, recordOp } from "@/lib/offlineOp";

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
  offline: offlineOpSchema.optional(),
});

export const PATCH = withAuth("repair.update", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  // Handing a phone back takes its balance into a wallet; a technician, who cannot see
  // wallets, leaves that to the counter.
  if (body.status === "DELIVERED" && !user.permissions.includes("wallet.view") && (await loadRepairFlow(user.businessId)).money !== "record") {
    throw new ApiError(403, "You don't have permission for that.");
  }
  const sameJob = () => prisma.repairJob.findFirst({ where: { id: params.id, businessId: user.businessId } });
  if (await priorOp(user.businessId, body.offline)) return json(await sameJob());
  const at = body.offline ? offlineAt(body.offline) : undefined;
  const before = await prisma.repairJob.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { status: true, paidAmount: true } });
  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
      const changed = await updateRepairStatus(tx, {
      businessId: user.businessId,
      userId: user.id,
      jobId: params.id,
      status: body.status,
      partsCost: body.partsCost === undefined ? undefined : toMinor(body.partsCost),
      finalCost: body.finalCost === undefined ? undefined : toMinor(body.finalCost),
      technicianId: body.technicianId,
      notes: body.notes,
      walletId: body.walletId,
      at,
      });
      await recordOp(tx, user.businessId, "repair.status", body.offline, changed.id);
      return changed;
    });
  } catch (error) {
    if (body.offline && isDuplicateOp(error)) return json(await sameJob());
    throw error;
  }
  if (before && (before.status !== job.status || job.paidAmount !== before.paidAmount)) {
    notifyAuditFeed(user.businessId, repairStatusNotice({
      ...job, from: before.status, to: job.status, paidNow: job.paidAmount - before.paidAmount, createdByName: user.name, notes: body.notes,
    }), undefined, user.id);
  }
  // Customers who asked after it on the shop's bot hear about it once the answer has gone.
  if (before && before.status !== job.status) {
    after(() => notifyRepairWatchers(job.id).catch((e) => console.error("[repair watch]", e)));
  }
  return json(job);
});

const deleteSchema = z.object({ reason: z.string().trim().max(300).optional() });

/** Owner only: staff with repair rights can cancel a job, but only the owner removes one. */
export const DELETE = withAuth("repair.update", async ({ req, user, params }) => {
  if (user.roleName !== "Owner") throw new ApiError(403, "Only the shop owner can delete a repair.");
  const body = await parseBody(req, deleteSchema);
  const { job } = await prisma.$transaction((tx) =>
    deleteRepairJob(tx, { businessId: user.businessId, userId: user.id, jobId: params.id, reason: body.reason })
  );
  notifyAuditFeed(
    user.businessId,
    `🗑 Repair deleted — ${job.jobNo}\n${job.deviceBrand} ${job.deviceModel}${job.customerName ? ` · ${job.customerName}` : ""}${body.reason ? `\nReason: ${body.reason}` : ""}\nBy: ${user.name}`,
    undefined, user.id,
  );
  return json({ ok: true });
});

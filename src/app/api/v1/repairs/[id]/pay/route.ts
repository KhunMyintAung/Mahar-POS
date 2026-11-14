import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { payRepairBalance } from "@/services/repairService";
import { loadRepairFlow } from "@/services/repairProfitService";
import { notifyAuditFeed, repairStatusNotice } from "@/lib/telegramNotify";
import { isDuplicateOp, offlineAt, offlineOpSchema, priorOp, recordOp } from "@/lib/offlineOp";

/** Mark as paid: collect whatever is left of the charge into a wallet. */

const schema = z.object({
  finalCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  /** What the repair cost the shop (parts…), so its profit shows. */
  partsCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  walletId: z.string().optional(),
  offline: offlineOpSchema.optional(),
});

export const POST = withAuth("repair.update", async ({ req, user, params }) => {
  // Taking money goes into a wallet; a technician, who cannot see wallets, cannot take it.
  if (!user.permissions.includes("wallet.view") && (await loadRepairFlow(user.businessId)).money !== "record") throw new ApiError(403, "You don't have permission for that.");
  const body = await parseBody(req, schema);
  const sameJob = () => prisma.repairJob.findFirst({ where: { id: params.id, businessId: user.businessId } });
  if (await priorOp(user.businessId, body.offline)) return json(await sameJob());
  const at = body.offline ? offlineAt(body.offline) : undefined;
  const before = await prisma.repairJob.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { status: true, paidAmount: true } });
  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
      const paid = await payRepairBalance(tx, {
      businessId: user.businessId,
      userId: user.id,
      jobId: params.id,
      finalCost: body.finalCost === undefined ? undefined : toMinor(body.finalCost),
      partsCost: body.partsCost === undefined ? undefined : toMinor(body.partsCost),
      walletId: body.walletId,
      at,
      });
      await recordOp(tx, user.businessId, "repair.pay", body.offline, paid.id);
      return paid;
    });
  } catch (error) {
    if (body.offline && isDuplicateOp(error)) return json(await sameJob());
    throw error;
  }
  if (before && job.paidAmount !== before.paidAmount) {
    notifyAuditFeed(user.businessId, repairStatusNotice({
      ...job, from: before.status, to: job.status, paidNow: job.paidAmount - before.paidAmount, createdByName: user.name,
    }), undefined, user.id, { perm: "repair.view", url: "/repairs" });
  }
  return json(job);
});

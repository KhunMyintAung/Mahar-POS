import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { payRepairBalance } from "@/services/repairService";
import { notifyAuditFeed, repairStatusNotice } from "@/lib/telegramNotify";

/** Mark as paid: collect whatever is left of the charge into a wallet. */

const schema = z.object({
  finalCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  walletId: z.string().optional(),
});

export const POST = withAuth("repair.update", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const before = await prisma.repairJob.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { status: true, paidAmount: true } });
  const job = await prisma.$transaction((tx) =>
    payRepairBalance(tx, {
      businessId: user.businessId,
      userId: user.id,
      jobId: params.id,
      finalCost: body.finalCost === undefined ? undefined : toMinor(body.finalCost),
      walletId: body.walletId,
    })
  );
  if (before && job.paidAmount !== before.paidAmount) {
    notifyAuditFeed(user.businessId, repairStatusNotice({
      jobNo: job.jobNo, deviceBrand: job.deviceBrand, deviceModel: job.deviceModel, from: before.status, to: job.status,
      finalCost: job.finalCost, paid: job.paidAmount - before.paidAmount, createdByName: user.name,
    }));
  }
  return json(job);
});

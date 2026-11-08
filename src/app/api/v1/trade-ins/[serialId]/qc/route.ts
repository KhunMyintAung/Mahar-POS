import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertBranchAccess } from "@/lib/tenant";
import { qcNeedsRepair, qcReady } from "@/services/tradeInService";
import { BODY_CONDITIONS, QC_GRADES } from "@/lib/tradeInQc";

const schema = z.object({
  result: z.enum(["READY", "REPAIR"]),
  grade: z.enum(QC_GRADES),
  bodyCondition: z.enum(BODY_CONDITIONS),
  batteryHealth: z.number().int().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(500).optional(),
  /** For REPAIR: what is wrong, and who repairs it. */
  problem: z.string().trim().max(500).optional(),
  technicianName: z.string().trim().max(120).optional(),
});

/** The QC result for a trade-in phone: ready to sell (into stock), or needs repair (onto the
 *  shop's own repair bench). */
export const POST = withAuth("purchase.create", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const serial = await prisma.itemSerial.findFirst({ where: { id: params.serialId, businessId: user.businessId }, select: { branchId: true } });
  if (!serial) throw new ApiError(404, "Phone not found");
  await assertBranchAccess(user, serial.branchId);
  const result = await prisma.$transaction(async (tx) => {
    const base = { businessId: user.businessId, userId: user.id, serialId: params.serialId, batteryHealth: body.batteryHealth, note: body.note, grade: body.grade, bodyCondition: body.bodyCondition };
    if (body.result === "READY") {
      await qcReady(tx, base);
      return { status: "IN_STOCK" };
    }
    const job = await qcNeedsRepair(tx, { ...base, problem: body.problem ?? "", technicianName: body.technicianName });
    return { status: "IN_REPAIR", repairJobId: job.id, jobNo: job.jobNo };
  });
  return json(result);
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { finishTradeInRepair } from "@/services/tradeInService";
import { BODY_CONDITIONS, QC_GRADES } from "@/lib/tradeInQc";

const schema = z.object({
  /** The repair fee (a technician's charge), added to the phone's cost with the parts used. */
  laborCost: z.string().default("0"),
  /** The wallet the fee was paid from now; left out when it is not paid out (own work). */
  walletId: z.string().optional(),
  note: z.string().trim().max(500).optional(),
  /** After the repair: the grade and body as they are now. */
  grade: z.enum(QC_GRADES).optional(),
  bodyCondition: z.enum(BODY_CONDITIONS).optional(),
});

/** A trade-in phone's repair is done: its cost takes in the repair, and it goes on the shelf. */
export const POST = withAuth("purchase.create", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const serial = await prisma.itemSerial.findFirst({ where: { id: params.serialId, businessId: user.businessId }, select: { branchId: true } });
  if (!serial) throw new ApiError(404, "Phone not found");
  await assertBranchAccess(user, serial.branchId);
  const result = await prisma.$transaction((tx) =>
    finishTradeInRepair(tx, { businessId: user.businessId, userId: user.id, serialId: params.serialId, laborCost: toMinor(body.laborCost), walletId: body.walletId, note: body.note, grade: body.grade, bodyCondition: body.bodyCondition })
  );
  return json(result);
});

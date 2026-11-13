import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reserveNumbers } from "@/lib/sequence";
import { voucherNumberFormat } from "@/services/repairService";

/** Sets aside the next few voucher numbers for this device while it is online, so the
 *  repairs it takes in without the internet keep the shop's normal sequence. A number the
 *  device never uses is a gap in the sequence, as a cancelled voucher would be. */

const schema = z.object({
  deviceId: z.string().trim().min(8).max(64),
  count: z.number().int().min(1).max(50).default(20),
});

export const POST = withAuth("repair.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const { block, numbers } = await prisma.$transaction(async (tx) => {
    const first = await reserveNumbers(tx, user.businessId, "REPAIR", body.count);
    const last = first + body.count - 1;
    const block = await tx.repairNumberBlock.create({
      data: { businessId: user.businessId, userId: user.id, deviceId: body.deviceId, first, last },
    });
    const format = await voucherNumberFormat(tx, user.businessId);
    const numbers = Array.from({ length: body.count }, (_, i) => ({ n: first + i, jobNo: format(first + i) }));
    return { block, numbers };
  });
  return json({ blockId: block.id, numbers }, { status: 201 });
});

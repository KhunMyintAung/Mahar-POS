import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { payRepairBalance } from "@/services/repairService";

/** Mark as paid: collect whatever is left of the charge into a wallet. */

const schema = z.object({
  finalCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  walletId: z.string().optional(),
});

export const POST = withAuth("repair.update", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const job = await prisma.$transaction((tx) =>
    payRepairBalance(tx, {
      businessId: user.businessId,
      userId: user.id,
      jobId: params.id,
      finalCost: body.finalCost === undefined ? undefined : toMinor(body.finalCost),
      walletId: body.walletId,
    })
  );
  return json(job);
});

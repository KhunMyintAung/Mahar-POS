import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { voidBillerTxn } from "@/services/billerService";

const schema = z.object({ reason: z.string().trim().min(3).max(200) });

export const POST = withAuth("biller.trade", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const txn = await prisma.$transaction((tx) =>
    voidBillerTxn(tx, { businessId: user.businessId, userId: user.id, txnId: params.id, reason: body.reason })
  );
  return json(txn);
});

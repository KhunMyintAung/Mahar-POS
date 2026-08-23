import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cancelSaleOrPurchase } from "@/services/posService";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("purchase.cancel", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  await prisma.$transaction(async (tx) =>
    cancelSaleOrPurchase(tx, "purchase", {
      id: params.id, reason: body.reason, userId: user.id, businessId: user.businessId,
    })
  );
  return json({ cancelled: true });
});

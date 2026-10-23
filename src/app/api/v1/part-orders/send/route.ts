import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  supplier: z.string().trim().min(1, "Which supplier?").max(80),
});

/** Parts sent to a supplier: they move from "to order" to "ordered", under that supplier. */
export const POST = withAuth("repair.update", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const result = await prisma.partOrder.updateMany({
    where: { id: { in: body.ids }, businessId: user.businessId, status: "TODO" },
    data: { status: "ORDERED", supplier: body.supplier, orderedAt: new Date() },
  });
  return json({ sent: result.count });
});

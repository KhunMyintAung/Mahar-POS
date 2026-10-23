import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { autoCorrectName } from "@/lib/autoCorrect";

async function own(businessId: string, id: string) {
  const order = await prisma.partOrder.findUnique({ where: { id } });
  if (!order || order.businessId !== businessId) throw new ApiError(404, "Order not found");
  return order;
}

const optional = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).optional();

const schema = z.object({
  item: z.string().trim().min(1).max(200).transform(autoCorrectName).optional(),
  customerName: optional(120),
  customerPhone: optional(40),
  deposit: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  note: optional(1000),
  status: z.enum(["WAITING", "GOT", "DONE"]).optional(),
});

/** Change an order: what it is, who for, where it was tried, or how far it has got. */
export const PATCH = withAuth("repair.update", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  await own(user.businessId, params.id);
  const order = await prisma.partOrder.update({
    where: { id: params.id },
    data: { ...body, deposit: body.deposit === undefined ? undefined : toMinor(body.deposit) },
  });
  return json(order);
});

export const DELETE = withAuth("repair.update", async ({ user, params }) => {
  await own(user.businessId, params.id);
  await prisma.partOrder.delete({ where: { id: params.id } });
  return json({ ok: true });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ORDER_STATUSES } from "@/lib/onlineShop";

const schema = z.object({
  status: z.enum(ORDER_STATUSES),
  /** The POS sale the order was rung up as, when it is completed from POS. */
  saleId: z.string().optional(),
});

/** Move an order along: confirmed, completed (rung up in POS) or cancelled. */
export const PATCH = withAuth("sale.create", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const order = await prisma.onlineOrder.findUnique({ where: { id: params.id } });
  if (!order || order.businessId !== user.businessId) throw new ApiError(404, "Order not found");
  if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new ApiError(409, "This order is already closed");
  if (body.saleId) {
    const sale = await prisma.sale.findUnique({ where: { id: body.saleId }, select: { businessId: true } });
    if (!sale || sale.businessId !== user.businessId) throw new ApiError(404, "Sale not found");
  }
  const updated = await prisma.onlineOrder.update({
    where: { id: order.id },
    data: { status: body.status, ...(body.saleId ? { saleId: body.saleId } : {}) },
    include: { lines: true },
  });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: `online_order.${body.status.toLowerCase()}`, module: "sales",
    resourceType: "OnlineOrder", resourceId: order.id, before: { status: order.status }, after: { status: body.status, saleId: body.saleId },
  });
  return json(updated);
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

async function ownImage(businessId: string, id: string) {
  const image = await prisma.itemImage.findUnique({ where: { id }, select: { id: true, businessId: true, itemId: true } });
  if (!image || image.businessId !== businessId) throw new ApiError(404, "Photo not found");
  return image;
}

/** Make this photo the item's first (the one on its card). */
export const PATCH = withAuth("item.manage", async ({ req, user, params }) => {
  await parseBody(req, z.object({ first: z.literal(true) }));
  const image = await ownImage(user.businessId, params.id);
  const all = await prisma.itemImage.findMany({ where: { itemId: image.itemId }, select: { id: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  const order = [image.id, ...all.map((i) => i.id).filter((id) => id !== image.id)];
  await prisma.$transaction(order.map((id, sort) => prisma.itemImage.update({ where: { id }, data: { sort } })));
  return json({ ok: true });
});

export const DELETE = withAuth("item.manage", async ({ user, params }) => {
  await ownImage(user.businessId, params.id);
  await prisma.itemImage.delete({ where: { id: params.id } });
  return json({ ok: true });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { IMAGE_DATA_URL, MAX_IMAGES, MAX_IMAGE_BYTES } from "@/lib/onlineShop";

async function ownItem(businessId: string, id: string) {
  const item = await prisma.item.findUnique({ where: { id }, select: { id: true, businessId: true, deletedAt: true } });
  if (!item || item.businessId !== businessId || item.deletedAt) throw new ApiError(404, "Item not found");
  return item;
}

const patchSchema = z.object({
  onlineVisible: z.boolean().optional(),
  description: z.string().max(1000).optional(),
});

/** Show or hide an item online, and the words under its photos. */
export const PATCH = withAuth("item.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  await ownItem(user.businessId, params.id);
  const item = await prisma.item.update({
    where: { id: params.id },
    data: { onlineVisible: body.onlineVisible, description: body.description },
    select: { id: true, onlineVisible: true, description: true },
  });
  return json(item);
});

const imageSchema = z.object({ dataUrl: z.string().max(Math.ceil(MAX_IMAGE_BYTES * 1.4) + 100) });

/** Add a photo (a data URL the browser has already resized). */
export const POST = withAuth("item.manage", async ({ req, user, params }) => {
  const { dataUrl } = await parseBody(req, imageSchema);
  await ownItem(user.businessId, params.id);
  const m = dataUrl.match(IMAGE_DATA_URL);
  if (!m) throw new ApiError(422, "Use a JPEG, PNG or WebP photo");
  const data = Buffer.from(m[2], "base64");
  if (data.length > MAX_IMAGE_BYTES) throw new ApiError(422, "That photo is too big");
  const count = await prisma.itemImage.count({ where: { itemId: params.id } });
  if (count >= MAX_IMAGES) throw new ApiError(422, `Up to ${MAX_IMAGES} photos per item`);
  const image = await prisma.itemImage.create({
    data: { businessId: user.businessId, itemId: params.id, mime: m[1], data, sort: count },
    select: { id: true },
  });
  return json(image, { status: 201 });
});

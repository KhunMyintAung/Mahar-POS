import { z } from "zod";
import { NextResponse } from "next/server";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { IMAGE_DATA_URL, MAX_IMAGE_BYTES, ONLINE_SHOP_COVER_KEY, coverImageResponse, loadShopCover, saveShopCover } from "@/lib/onlineShop";

/** The shop page's cover photo, for the preview in Online Shop → Settings. */
export const GET = withAuth("item.view", async ({ user }) => {
  const cover = await loadShopCover(user.businessId);
  return cover ? coverImageResponse(cover.dataUrl, "private, max-age=3600") : new NextResponse(null, { status: 404 });
});

const schema = z.object({ dataUrl: z.string().max(Math.ceil(MAX_IMAGE_BYTES * 1.4) + 100) });

/** Set the cover photo (a data URL the browser has already resized). */
export const PUT = withAuth("item.manage", async ({ req, user }) => {
  const { dataUrl } = await parseBody(req, schema);
  const m = dataUrl.match(IMAGE_DATA_URL);
  if (!m) throw new ApiError(422, "Use a JPEG, PNG or WebP photo");
  if (Buffer.from(m[2], "base64").length > MAX_IMAGE_BYTES) throw new ApiError(422, "That photo is too big");
  const row = await saveShopCover(user.businessId, dataUrl);
  await audit(prisma, { businessId: user.businessId, userId: user.id, action: "online_shop.cover", module: "settings", after: { cover: "set" } });
  return json({ cover: `/api/v1/online-shop/cover?v=${row.updatedAt.getTime()}` });
});

export const DELETE = withAuth("item.manage", async ({ user }) => {
  await prisma.systemSetting.deleteMany({ where: { businessId: user.businessId, key: ONLINE_SHOP_COVER_KEY } });
  await audit(prisma, { businessId: user.businessId, userId: user.id, action: "online_shop.cover", module: "settings", after: { cover: "removed" } });
  return json({ ok: true });
});

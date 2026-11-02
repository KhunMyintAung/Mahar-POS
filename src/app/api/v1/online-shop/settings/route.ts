import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { loadOnlineShop, loadShopCover, parseOnlineShop, saveOnlineShop, slugProblem, suggestSlug, SHOP_LINK_KINDS } from "@/lib/onlineShop";

/** The Online Shop's address and the words on its page. */
export const GET = withAuth("item.view", async ({ user }) => {
  const [business, cfg, cover] = await Promise.all([
    prisma.business.findUnique({ where: { id: user.businessId }, select: { name: true, phone: true, shopSlug: true, latitude: true, address: true } }),
    loadOnlineShop(user.businessId),
    loadShopCover(user.businessId),
  ]);
  return json({
    ...cfg,
    slug: business?.shopSlug ?? "",
    suggestedSlug: suggestSlug(business?.name ?? ""),
    shopPhone: business?.phone ?? "",
    // What the map button falls back to when there is no Maps link.
    hasLocation: business?.latitude != null,
    hasAddress: Boolean(business?.address?.trim()),
    cover: cover ? `/api/v1/online-shop/cover?v=${cover.version}` : "",
  });
});

const schema = z.object({
  slug: z.string().trim().toLowerCase(),
  enabled: z.boolean(),
  intro: z.string().max(300),
  delivery: z.string().max(300),
  payment: z.string().max(300),
  phone: z.string().max(40),
  // Optional, so a page still open from before these existed can save.
  mapUrl: z.string().max(500).optional(),
  links: z.object(Object.fromEntries(SHOP_LINK_KINDS.map((k) => [k, z.string().max(200).optional()]))).optional(),
  gameTopupUrl: z.string().max(500).optional(),
});

export const PUT = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const problem = slugProblem(body.slug);
  if (problem) throw new ApiError(422, problem);
  const taken = await prisma.business.findFirst({ where: { shopSlug: body.slug, id: { not: user.businessId } }, select: { id: true } });
  if (taken) throw new ApiError(409, "Another shop already has that address. Try another.");
  const before = await loadOnlineShop(user.businessId);
  // parseOnlineShop keeps only real web links, so the shop page never carries a bad one.
  const cfg = parseOnlineShop({
    enabled: body.enabled, intro: body.intro, delivery: body.delivery, payment: body.payment, phone: body.phone.trim(),
    mapUrl: body.mapUrl ?? before.mapUrl,
    links: body.links ?? before.links,
    gameTopupUrl: body.gameTopupUrl ?? before.gameTopupUrl,
  });
  await prisma.business.update({ where: { id: user.businessId }, data: { shopSlug: body.slug } });
  await saveOnlineShop(user.businessId, cfg);
  await audit(prisma, { businessId: user.businessId, userId: user.id, action: "online_shop.settings", module: "settings", after: { ...cfg, slug: body.slug } });
  return json({ ...cfg, slug: body.slug });
});

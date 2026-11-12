import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { loadOnlineShop, saveOnlineShop } from "@/lib/onlineShop";

/** What the shop's bot tells a customer who asks for a spare part's price: how soon it can be
 *  fitted, and a line under the prices. Kept with the Online Shop's words, which the bot
 *  already speaks from, but saved on its own so a shop with no shop page can set it. */
export const GET = withAuth("settings.manage", async ({ user }) => {
  const cfg = await loadOnlineShop(user.businessId);
  return json({ partsHours: cfg.partsHours, partsDays: cfg.partsDays, partsNote: cfg.partsNote });
});

const schema = z.object({
  partsHours: z.number().int().min(1).max(72),
  partsDays: z.number().int().min(1).max(60),
  partsNote: z.string().trim().max(200),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const before = await loadOnlineShop(user.businessId);
  await saveOnlineShop(user.businessId, { ...before, ...body });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "telegram.parts", module: "settings",
    before: { partsHours: before.partsHours, partsDays: before.partsDays, partsNote: before.partsNote }, after: body,
  });
  return json(body);
});

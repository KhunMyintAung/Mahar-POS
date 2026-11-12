import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { loadOnlineShop, saveOnlineShop } from "@/lib/onlineShop";
import { loadAiKey } from "@/lib/aiKey";

/** How the shop's bot treats customers: how soon a spare part is fitted, a line under the
 *  prices, whether their own words are answered by AI, and whether orders are collected at
 *  the shop only. Kept with the Online Shop's words, which the bot already speaks from, but
 *  saved on its own so a shop with no shop page can set it. */
const pick = (cfg: Awaited<ReturnType<typeof loadOnlineShop>>) => ({
  partsHours: cfg.partsHours, partsDays: cfg.partsDays, partsNote: cfg.partsNote, aiCustomers: cfg.aiCustomers, pickupOnly: cfg.pickupOnly,
});

export const GET = withAuth("settings.manage", async ({ user }) => {
  const [cfg, key] = await Promise.all([loadOnlineShop(user.businessId), loadAiKey(user.id)]);
  // AI answers come from the key of the bot's own staff member; this says whether yours has one.
  return json({ ...pick(cfg), hasAiKey: Boolean(key) });
});

const schema = z.object({
  partsHours: z.number().int().min(1).max(72),
  partsDays: z.number().int().min(1).max(60),
  partsNote: z.string().trim().max(200),
  aiCustomers: z.boolean().optional(),
  pickupOnly: z.boolean().optional(),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const before = await loadOnlineShop(user.businessId);
  const next = { ...before, ...body, aiCustomers: body.aiCustomers ?? before.aiCustomers, pickupOnly: body.pickupOnly ?? before.pickupOnly };
  await saveOnlineShop(user.businessId, next);
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "telegram.customers", module: "settings",
    before: pick(before), after: pick(next),
  });
  const key = await loadAiKey(user.id);
  return json({ ...pick(next), hasAiKey: Boolean(key) });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { normalizeMspAddress } from "@/lib/msp";
import { loadPromoShops, rewardSummary, saveRewardSettings } from "@/services/mspRewardService";

// The shop's MSP reward for using Mahar POS: what it has earned, and its switch and wallet.
// Anyone signed in may read it (the Overview card shows it); changing it needs settings.manage.
export const GET = withAuth(null, async ({ user }) => json(await rewardSummary(user.businessId)));

const schema = z.object({
  on: z.boolean(),
  wallet: z.string().trim().max(100),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  if (!(await loadPromoShops()).includes(user.businessId)) throw new ApiError(403, "This shop is not in the MSP promotion");
  const wallet = body.wallet ? normalizeMspAddress(body.wallet) : null;
  if (body.wallet && !wallet) throw new ApiError(422, "That is not a BNB Chain wallet address (0x…)");
  if (body.on && !wallet) throw new ApiError(422, "Enter the shop's BNB Chain wallet first");
  const { prev, next } = await saveRewardSettings(user.businessId, { on: body.on, wallet });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "UPDATE", module: "msp",
    resourceType: "MspRewards", before: { on: prev.on, wallet: prev.wallet }, after: { on: next.on, wallet: next.wallet },
  });
  return json(await rewardSummary(user.businessId));
});

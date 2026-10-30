import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rewardSummary, saveRewardSettings } from "@/services/mspRewardService";

// The shop's MSP reward for using Mahar POS: its switch and what it has earned. The points
// go to the shop's MSP wallet (/api/v1/msp/wallet).
export const GET = withAuth("settings.manage", async ({ user }) => json(await rewardSummary(user.businessId)));

const schema = z.object({ on: z.boolean() });

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const { prev, next } = await saveRewardSettings(user.businessId, { on: body.on });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "UPDATE", module: "msp",
    resourceType: "MspRewards", before: { on: prev.on }, after: { on: next.on },
  });
  return json(await rewardSummary(user.businessId));
});

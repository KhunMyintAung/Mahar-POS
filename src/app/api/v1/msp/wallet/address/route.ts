import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { normalizeMspAddress } from "@/lib/msp";
import { saveRewardSettings } from "@/services/mspRewardService";
import { walletSummary } from "@/services/mspWalletService";

// The shop's own BNB Chain wallet, where withdrawals go.
const schema = z.object({ address: z.string().trim().max(100) });

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const wallet = normalizeMspAddress(body.address);
  if (!wallet) throw new ApiError(422, "That is not a BNB Chain wallet address (0x…)");
  const { prev, next } = await saveRewardSettings(user.businessId, { wallet });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "UPDATE", module: "msp",
    resourceType: "MspWallet", before: { address: prev.wallet }, after: { address: next.wallet },
  });
  return json(await walletSummary(user.businessId));
});

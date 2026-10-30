import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { parseMspAmount } from "@/lib/mspWallet";
import { walletSummary, withdraw } from "@/services/mspWalletService";

// Takes MSP out to the shop's own BNB Chain wallet. The fee stays with the platform for gas.
const schema = z.object({ amount: z.string().trim().max(20) });

export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const amount = parseMspAmount(body.amount);
  if (!amount) throw new ApiError(422, "Enter an amount like 1 or 0.5");
  const w = await withdraw({ businessId: user.businessId, userId: user.id, amount });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "CREATE", module: "msp",
    resourceType: "MspWithdrawal", resourceId: w.id, after: { amount: w.amount, fee: w.fee, address: w.address },
  });
  return json(await walletSummary(user.businessId));
});

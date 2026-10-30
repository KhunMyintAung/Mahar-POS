import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { parseMspAmount } from "@/lib/mspWallet";
import { sendToShop, walletSummary } from "@/services/mspWalletService";

// Sends MSP to another shop's MSP wallet. Free: only the balances move.
const schema = z.object({ to: z.string().trim().max(20), amount: z.string().trim().max(20), note: z.string().trim().max(120).optional() });

export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const amount = parseMspAmount(body.amount);
  if (!amount) throw new ApiError(422, "Enter an amount like 1 or 0.5");
  const t = await sendToShop({ businessId: user.businessId, userId: user.id, to: body.to, amount, note: body.note });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "CREATE", module: "msp",
    resourceType: "MspTransfer", resourceId: t.id, after: { to: t.toBusinessId, amount: t.amount, note: t.note },
  });
  return json(await walletSummary(user.businessId));
});

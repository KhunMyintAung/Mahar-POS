import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reverseTransfer } from "@/services/walletService";
import { notifyAuditFeed, reversalNotice } from "@/lib/telegramNotify";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("wallet.reverse", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const transfer = await prisma.walletTransfer.findFirst({ where: { id: params.id, businessId: user.businessId } });
  await prisma.$transaction((tx) =>
    reverseTransfer(tx, { transferId: params.id, reason: body.reason, userId: user.id, businessId: user.businessId })
  );
  notifyAuditFeed(
    user.businessId,
    reversalNotice({ icon: "🔁", label: "Transfer", txnNo: transfer?.txnNo ?? params.id, reason: body.reason, createdByName: user.name })
  );
  return json({ reversed: true });
});

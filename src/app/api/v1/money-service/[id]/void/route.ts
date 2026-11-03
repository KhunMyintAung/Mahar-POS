import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { voidMoneyService } from "@/services/moneyService";
import { notifyAuditFeed, reversalNotice } from "@/lib/telegramNotify";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("wallet.reverse", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const voided = await prisma.$transaction((tx) =>
    voidMoneyService(tx, { businessId: user.businessId, userId: user.id, id: params.id, reason: body.reason })
  );
  notifyAuditFeed(
    user.businessId,
    reversalNotice({ icon: "💸", label: voided.kind === "TRANSFER" ? "ငွေလွဲပေး" : "ငွေထုတ်ပေး", txnNo: voided.txnNo, reason: body.reason, createdByName: user.name }), undefined, user.id
  );
  return json({ voided: true });
});

import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reverseIncomeExpense } from "@/services/incomeExpenseService";
import { notifyAuditFeed, reversalNotice } from "@/lib/telegramNotify";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("wallet.reverse", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const it = await prisma.incomeExpense.findFirst({ where: { id: params.id, businessId: user.businessId } });
  await prisma.$transaction((tx) =>
    reverseIncomeExpense(tx, { id: params.id, reason: body.reason, userId: user.id, businessId: user.businessId })
  );
  const label = it?.type === "INCOME" ? "Income" : it?.type === "WITHDRAW" ? "Withdrawal" : "Expense";
  const icon = it?.type === "INCOME" ? "💰" : it?.type === "WITHDRAW" ? "➖" : "💸";
  notifyAuditFeed(
    user.businessId,
    reversalNotice({ icon, label, txnNo: it?.txnNo ?? params.id, reason: body.reason, createdByName: user.name })
  );
  return json({ reversed: true });
});

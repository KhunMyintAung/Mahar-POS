import { z } from "zod";
import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordPurchaseExpense } from "@/services/incomeExpenseService";

const schema = z.object({ line: z.enum(["SALE", "SERVICE"]).optional() });

/** "Yes, add it to expense" after a purchase: records it as Daily Sale Expense (goods to
 *  sell) or Daily Service Expense (repair parts) without moving any money again. Sent for a
 *  purchase already recorded, it moves the record to the side asked for. */
export const POST = withAuth("purchase.create", async ({ req, user, params }) => {
  const body = schema.parse(await req.json().catch(() => ({})));
  const entry = await prisma.$transaction((tx) =>
    recordPurchaseExpense(tx, { businessId: user.businessId, userId: user.id, purchaseId: params.id, line: body.line })
  );
  return json(entry);
});

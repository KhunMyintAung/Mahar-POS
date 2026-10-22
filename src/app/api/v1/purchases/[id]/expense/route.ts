import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordPurchaseExpense } from "@/services/incomeExpenseService";

/** "Yes, add it to expense" after a purchase: records it as Daily Sale Expense without
 *  moving any money again. */
export const POST = withAuth("purchase.create", async ({ user, params }) => {
  const entry = await prisma.$transaction((tx) =>
    recordPurchaseExpense(tx, { businessId: user.businessId, userId: user.id, purchaseId: params.id })
  );
  return json(entry);
});

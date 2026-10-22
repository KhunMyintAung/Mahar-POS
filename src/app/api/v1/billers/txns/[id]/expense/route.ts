import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordFloatExpense } from "@/services/incomeExpenseService";

/** "Yes, add it to expense" after Bought float: records the purchase as Daily Bill Expense
 *  without moving the wallet again. */
export const POST = withAuth("biller.trade", async ({ user, params }) => {
  const entry = await prisma.$transaction((tx) =>
    recordFloatExpense(tx, { businessId: user.businessId, userId: user.id, billerTxnId: params.id })
  );
  return json(entry);
});

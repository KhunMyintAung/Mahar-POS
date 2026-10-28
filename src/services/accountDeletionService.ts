import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

/** Permanently erase every trace of one business.
 *
 *  None of the businessId foreign keys declare onDelete: Cascade, so the rows have to go
 *  in dependency order — children before the parents they point at. The whole thing runs
 *  in one transaction: if this list is ever wrong or incomplete, Postgres rejects the
 *  delete on a foreign key and the transaction rolls back, so the alternative to a
 *  correct wipe is no wipe rather than a half-erased business.
 */
export async function purgeBusiness(tx: Tx, businessId: string) {
  const business = await tx.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } });
  if (!business) throw new ApiError(404, "Business not found");

  const userIds = (await tx.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
  const branchIds = (await tx.branch.findMany({ where: { businessId }, select: { id: true } })).map((b) => b.id);
  const itemIds = (await tx.item.findMany({ where: { businessId }, select: { id: true } })).map((i) => i.id);
  const saleIds = (await tx.sale.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
  const purchaseIds = (await tx.purchase.findMany({ where: { businessId }, select: { id: true } })).map((p) => p.id);
  const receivableIds = (await tx.receivable.findMany({ where: { businessId }, select: { id: true } })).map((r) => r.id);
  const payableIds = (await tx.payable.findMany({ where: { businessId }, select: { id: true } })).map((p) => p.id);

  const deleted: Record<string, number> = {};
  const run = async (label: string, fn: () => Promise<{ count: number }>) => {
    deleted[label] = (await fn()).count;
  };

  // 1. Line items and payments — they point at documents that are themselves going.
  await run("saleLine", () => tx.saleLine.deleteMany({ where: { saleId: { in: saleIds } } }));
  await run("purchaseLine", () => tx.purchaseLine.deleteMany({ where: { purchaseId: { in: purchaseIds } } }));
  await run("receivablePayment", () => tx.receivablePayment.deleteMany({ where: { receivableId: { in: receivableIds } } }));
  await run("payablePayment", () => tx.payablePayment.deleteMany({ where: { payableId: { in: payableIds } } }));
  await run("stockLevel", () => tx.stockLevel.deleteMany({ where: { itemId: { in: itemIds } } }));

  // 2. Session and membership rows hanging off users.
  await run("telegramSession", () => tx.telegramSession.deleteMany({ where: { ownerUserId: { in: userIds } } }));
  await run("authSession", () => tx.authSession.deleteMany({ where: { userId: { in: userIds } } }));
  await run("userBranch", () => tx.userBranch.deleteMany({ where: { userId: { in: userIds } } }));

  // 3. Documents. Sales and purchases reference receivables, payables and wallets, so
  //    they go before those.
  await run("sale", () => tx.sale.deleteMany({ where: { businessId } }));
  await run("purchase", () => tx.purchase.deleteMany({ where: { businessId } }));
  await run("stockMovement", () => tx.stockMovement.deleteMany({ where: { businessId } }));
  await run("incomeExpense", () => tx.incomeExpense.deleteMany({ where: { businessId } }));
  await run("receivable", () => tx.receivable.deleteMany({ where: { businessId } }));
  await run("payable", () => tx.payable.deleteMany({ where: { businessId } }));

  // 4. Wallet history, then the wallets themselves.
  await run("walletLedgerEntry", () => tx.walletLedgerEntry.deleteMany({ where: { businessId } }));
  await run("walletTransfer", () => tx.walletTransfer.deleteMany({ where: { businessId } }));
  await run("walletReconciliation", () => tx.walletReconciliation.deleteMany({ where: { businessId } }));
  await run("wallet", () => tx.wallet.deleteMany({ where: { businessId } }));

  // 5. Catalogue. Items reference categories and units.
  await run("item", () => tx.item.deleteMany({ where: { businessId } }));
  await run("itemCategory", () => tx.itemCategory.deleteMany({ where: { businessId } }));
  await run("unit", () => tx.unit.deleteMany({ where: { businessId } }));
  await run("category", () => tx.category.deleteMany({ where: { businessId } }));

  // 6. Everything still pointing at users or branches.
  await run("dailyClose", () => tx.dailyClose.deleteMany({ where: { businessId } }));
  await run("notification", () => tx.notification.deleteMany({ where: { businessId } }));
  await run("auditLog", () => tx.auditLog.deleteMany({ where: { businessId } }));
  await run("contact", () => tx.contact.deleteMany({ where: { businessId } }));
  await run("systemSetting", () => tx.systemSetting.deleteMany({ where: { businessId } }));
  await run("numberSequence", () => tx.numberSequence.deleteMany({ where: { businessId } }));
  await run("feedback", () => tx.feedback.deleteMany({ where: { businessId } }));

  // 7. Users before the roles they hold, branches after everything that referenced them.
  await run("user", () => tx.user.deleteMany({ where: { businessId } }));
  await run("role", () => tx.role.deleteMany({ where: { businessId } }));
  await run("branch", () => tx.branch.deleteMany({ where: { businessId } }));

  // 8. The business row itself.
  await tx.business.delete({ where: { id: businessId } });
  deleted.business = 1;

  return { businessName: business.name, branchCount: branchIds.length, userCount: userIds.length, deleted };
}

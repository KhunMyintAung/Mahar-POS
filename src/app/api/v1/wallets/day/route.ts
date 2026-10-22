import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dateRangeUtc, isValidBusinessDate, todayBusinessDate } from "@/lib/dates";

/** Every wallet movement on one business day, across the wallets this user can see, with
 *  the day's totals: money in, money out, transfers between wallets and withdrawals.
 *  ?date=YYYY-MM-DD (today when left out). */
export const GET = withAuth("wallet.view", async ({ req, user }) => {
  const date = req.nextUrl.searchParams.get("date") ?? todayBusinessDate();
  if (!isValidBusinessDate(date)) throw new ApiError(422, "Invalid date");

  const wallets = await prisma.wallet.findMany({
    where: {
      businessId: user.businessId,
      deletedAt: null,
      ...(user.allBranches ? {} : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }),
    },
    select: { id: true, name: true, currency: true },
  });
  const byId = new Map(wallets.map((w) => [w.id, w]));
  const entries = await prisma.walletLedgerEntry.findMany({
    where: { businessId: user.businessId, walletId: { in: wallets.map((w) => w.id) }, createdAt: dateRangeUtc(date) },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, walletId: true, direction: true, amount: true, balanceAfter: true, refType: true, description: true, createdAt: true },
  });

  // Totals per currency: what came in and went out, and of that, moves between own wallets
  // (transfers) and owner withdrawals.
  const totals: Record<string, { moneyIn: bigint; moneyOut: bigint; transfers: bigint; withdrawals: bigint; count: number }> = {};
  for (const e of entries) {
    const cur = byId.get(e.walletId)?.currency ?? "MMK";
    const t = (totals[cur] ??= { moneyIn: 0n, moneyOut: 0n, transfers: 0n, withdrawals: 0n, count: 0 });
    t.count++;
    if (e.direction === "DEBIT") t.moneyIn += e.amount; else t.moneyOut += e.amount;
    if (e.refType === "TRANSFER_OUT") t.transfers += e.amount;
    if (e.refType === "WITHDRAW") t.withdrawals += e.amount;
  }

  return json({
    date,
    totals,
    entries: entries.map((e) => ({ ...e, walletName: byId.get(e.walletId)?.name ?? "", currency: byId.get(e.walletId)?.currency ?? "MMK" })),
  });
});

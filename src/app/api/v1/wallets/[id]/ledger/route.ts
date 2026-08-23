import { withAuth, json, pagination, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";

export const GET = withAuth("wallet.view", async ({ req, user, params }) => {
  const wallet = await prisma.wallet.findUnique({ where: { id: params.id } });
  if (!wallet || wallet.businessId !== user.businessId) throw new ApiError(404, "Wallet not found");
  if (wallet.branchId && !canAccessBranch(user, wallet.branchId))
    throw new ApiError(403, "No access to this branch");

  const { skip, take, page, pageSize } = pagination(req, 50);
  const [entries, total] = await Promise.all([
    prisma.walletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.walletLedgerEntry.count({ where: { walletId: wallet.id } }),
  ]);

  // A REVERSAL entry points back at the original entry's own id (see
  // reverseLedgerEntries) — use that to tell the client which rows already
  // have a reversal so it doesn't offer to void them again.
  const reversedIds = new Set(
    (
      await prisma.walletLedgerEntry.findMany({
        where: { walletId: wallet.id, refType: "REVERSAL", refId: { in: entries.map((e) => e.id) } },
        select: { refId: true },
      })
    ).map((r) => r.refId)
  );
  const withReversed = entries.map((e) => ({ ...e, reversed: reversedIds.has(e.id) }));

  return json({ wallet, entries: withReversed, total, page, pageSize });
});

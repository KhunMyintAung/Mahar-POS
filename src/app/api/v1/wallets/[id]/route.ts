import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

/** Loads a wallet that belongs to this business and is visible to this user. */
async function loadWallet(businessId: string, id: string, scope: ReturnType<typeof branchScope>) {
  const wallet = await prisma.wallet.findFirst({
    where: { id, businessId, deletedAt: null, ...scope },
  });
  if (!wallet) throw new ApiError(404, "Wallet not found");
  return wallet;
}

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  type: z.enum(["CASH", "BANK", "MOBILE", "AGENT", "CUSTOMER", "EXPENSE", "CLEARING", "CUSTOM"]).optional(),
  minBalance: z.string().optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

/** Edit a wallet's details.
 *
 *  Balance and currency are deliberately not editable here. The balance is derived from
 *  the ledger, so typing a new one would put the wallet and its history out of step —
 *  that is what the adjust endpoint is for, and it writes a ledger entry. Currency would
 *  reinterpret every past amount, so it is fixed once money has a meaning.
 */
export const PATCH = withAuth("wallet.create", async ({ req, user, params }) => {
  const wallet = await loadWallet(user.businessId, params.id, branchScope(user));
  const body = await parseBody(req, updateSchema);

  const code = body.code ? body.code.toUpperCase() : undefined;
  if (code && code !== wallet.code) {
    const duplicate = await prisma.wallet.findUnique({
      where: { businessId_code: { businessId: user.businessId, code } },
      select: { id: true },
    });
    if (duplicate) throw new ApiError(409, "Wallet code already exists");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.minBalance !== undefined ? { minBalance: toMinor(body.minBalance) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: wallet.branchId ?? undefined,
      action: "UPDATE", module: "wallet", resourceType: "Wallet", resourceId: w.id,
      before: { name: wallet.name, code: wallet.code, type: wallet.type, active: wallet.active },
      after: { name: w.name, code: w.code, type: w.type, active: w.active },
    });
    return w;
  });

  return json(updated);
});

/** Remove a wallet.
 *
 *  This marks it deleted rather than dropping the row: the ledger, transfers, sales and
 *  every other record that moved money still point at it, and those must keep reading
 *  correctly. Lists already filter on deletedAt, so it disappears from the app.
 *
 *  A wallet still holding money cannot be removed — hiding a non-zero balance would make
 *  the money look like it vanished rather than being moved somewhere.
 */
export const DELETE = withAuth("wallet.create", async ({ user, params }) => {
  const wallet = await loadWallet(user.businessId, params.id, branchScope(user));

  if (wallet.currentBalance !== 0n) {
    throw new ApiError(
      409,
      "This wallet still holds a balance. Transfer or adjust it to zero before removing it."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { deletedAt: new Date(), active: false },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: wallet.branchId ?? undefined,
      action: "DELETE", module: "wallet", resourceType: "Wallet", resourceId: wallet.id,
      before: { name: wallet.name, code: wallet.code, currentBalance: wallet.currentBalance },
    });
  });

  return json({ ok: true });
});

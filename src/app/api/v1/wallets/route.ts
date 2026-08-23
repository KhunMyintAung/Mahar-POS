import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

export const GET = withAuth("wallet.view", async ({ user }) => {
  const wallets = await prisma.wallet.findMany({
    where: { businessId: user.businessId, deletedAt: null, ...branchScope(user) },
    orderBy: { name: "asc" },
  });
  return json(wallets);
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).max(50),
  type: z.enum(["CASH", "BANK", "MOBILE", "AGENT", "CUSTOMER", "EXPENSE", "CLEARING", "CUSTOM"]),
  currency: z.enum(["MMK", "THB"]),
  branchId: z.string().min(1),
  openingBalance: z.string().default("0"),
  minBalance: z.string().default("0"),
  description: z.string().optional(),
});

export const POST = withAuth("wallet.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);
  await assertBranchAccess(user, body.branchId);
  const opening = toMinor(body.openingBalance);
  const code = body.code.toUpperCase();
  const duplicate = await prisma.wallet.findUnique({
    where: { businessId_code: { businessId: user.businessId, code } },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, "Wallet code already exists");

  const wallet = await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.create({
      data: {
        businessId: user.businessId,
        branchId: body.branchId,
        name: body.name,
        code,
        type: body.type,
        currency: body.currency,
        openingBalance: opening,
        currentBalance: opening,
        minBalance: toMinor(body.minBalance),
        description: body.description,
      },
    });
    if (opening !== 0n) {
      await tx.walletLedgerEntry.create({
        data: {
          walletId: w.id,
          businessId: user.businessId,
          branchId: body.branchId,
          direction: "DEBIT",
          amount: opening,
          balanceAfter: opening,
          refType: "OPENING",
          description: "Opening balance",
          createdById: user.id,
        },
      });
    }
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "CREATE", module: "wallet", resourceType: "Wallet", resourceId: w.id,
      after: { name: w.name, code: w.code, opening },
    });
    return w;
  });
  return json(wallet, { status: 201 });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { fmtMsp, normalizeMspAddress } from "@/lib/msp";
import { mspChainConfig } from "@/services/mspService";

export const GET = withAuth("customer.view", async ({ user, params }) => {
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact || contact.businessId !== user.businessId || contact.deletedAt)
    throw new ApiError(404, "Contact not found");

  const [receivables, recAgg, payAgg, mspByStatus, mspRecent] = await Promise.all([
    prisma.receivable.findMany({
      where: { customerId: contact.id, deletedAt: null, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" }, take: 20,
      include: { payments: true },
    }),
    prisma.receivable.aggregate({
      where: { customerId: contact.id, deletedAt: null, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] } },
      _sum: { remainingAmount: true },
    }),
    prisma.payable.aggregate({
      where: { supplierId: contact.id, deletedAt: null, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] } },
      _sum: { remainingAmount: true },
    }),
    prisma.mspAward.groupBy({
      by: ["status"],
      where: { customerId: contact.id, businessId: user.businessId, status: { not: "CANCELLED" } },
      _sum: { amount: true },
    }),
    prisma.mspAward.findMany({
      where: { customerId: contact.id, businessId: user.businessId },
      orderBy: { createdAt: "desc" }, take: 20,
    }),
  ]);
  // Points: waiting (no wallet yet, or not sent), on the way (in a batch), and in the wallet.
  const sumOf = (s: string) => mspByStatus.find((g) => g.status === s)?._sum.amount ?? 0n;
  const [sales, batches] = await Promise.all([
    prisma.sale.findMany({ where: { id: { in: mspRecent.map((a) => a.saleId) } }, select: { id: true, txnNo: true } }),
    prisma.mspBatch.findMany({ where: { id: { in: mspRecent.flatMap((a) => (a.batchId ? [a.batchId] : [])) } }, select: { id: true, txHash: true } }),
  ]);
  const chain = mspChainConfig();
  return json({
    contact, receivables,
    currentReceivable: recAgg._sum.remainingAmount ?? 0n,
    currentPayable: payAgg._sum.remainingAmount ?? 0n,
    msp: {
      pending: fmtMsp(sumOf("PENDING")),
      sending: fmtMsp(sumOf("SENT")),
      minted: fmtMsp(sumOf("MINTED")),
      explorer: chain?.explorer ?? null,
      contract: chain?.contract ?? null,
      awards: mspRecent.map((a) => ({
        id: a.id, points: fmtMsp(a.amount), status: a.status, createdAt: a.createdAt,
        txnNo: sales.find((s) => s.id === a.saleId)?.txnNo ?? null,
        txHash: batches.find((b) => b.id === a.batchId)?.txHash ?? null,
      })),
    },
  });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  telegram: z.string().optional(),
  address: z.string().optional(),
  type: z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "CREDITOR", "DEBTOR", "OTHER"]).optional(),
  creditLimit: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
  /** Empty clears it. */
  mspAddress: z.string().trim().optional(),
});

export const PATCH = withAuth("customer.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact || contact.businessId !== user.businessId) throw new ApiError(404, "Contact not found");

  const { creditLimit, mspAddress, ...rest } = body;
  let wallet: string | null | undefined;
  if (mspAddress !== undefined) {
    wallet = mspAddress === "" ? null : normalizeMspAddress(mspAddress);
    if (wallet === null && mspAddress !== "") throw new ApiError(422, "That is not a BNB Chain wallet address (0x…)");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.contact.update({
      where: { id: contact.id },
      data: {
        ...rest,
        ...(creditLimit !== undefined ? { creditLimit: toMinor(creditLimit) } : {}),
        ...(wallet !== undefined ? { mspAddress: wallet } : {}),
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "customer", resourceType: "Contact", resourceId: c.id,
      before: { name: contact.name }, after: body,
    });
    return c;
  });
  return json(updated);
});

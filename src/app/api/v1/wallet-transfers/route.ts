import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createTransfer } from "@/services/walletService";
import { notifyAuditFeed, transferNotice } from "@/lib/telegramNotify";
import { todayBusinessDate, dateRangeUtc } from "@/lib/dates";

export const GET = withAuth("wallet.view", async ({ req, user }) => {
  const { skip, take, page, pageSize } = pagination(req);
  const [transfers, total, todayTransfers] = await Promise.all([
    prisma.walletTransfer.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: "desc" },
      skip, take,
    }),
    prisma.walletTransfer.count({ where: { businessId: user.businessId } }),
    prisma.walletTransfer.findMany({
      where: { businessId: user.businessId, status: "COMPLETED", createdAt: dateRangeUtc(todayBusinessDate()) },
      select: { sourceWalletId: true, sourceAmount: true },
    }),
  ]);

  const sourceWallets = await prisma.wallet.findMany({
    where: { id: { in: [...new Set(todayTransfers.map((t) => t.sourceWalletId))] } },
    select: { id: true, currency: true },
  });
  const currencyById = new Map(sourceWallets.map((w) => [w.id, w.currency]));
  const todayByCurrency = new Map<string, bigint>();
  for (const t of todayTransfers) {
    const currency = currencyById.get(t.sourceWalletId) ?? "MMK";
    todayByCurrency.set(currency, (todayByCurrency.get(currency) ?? 0n) + t.sourceAmount);
  }

  return json({
    transfers, total, page, pageSize,
    todayTotal: [...todayByCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
  });
});

const schema = z.object({
  sourceWalletId: z.string().min(1),
  destWalletId: z.string().min(1),
  amount: z.string().min(1),
  rate: z.string().optional(), // required when currencies differ: dest units per 1 source unit
  fee: z.string().default("0"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("wallet.transfer", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  if (body.sourceWalletId === body.destWalletId)
    throw new ApiError(422, "Source and destination wallets must differ");

  const result = await prisma.$transaction((tx) =>
    createTransfer(tx, {
      businessId: user.businessId,
      userId: user.id,
      sourceWalletId: body.sourceWalletId,
      destWalletId: body.destWalletId,
      amount: body.amount,
      rate: body.rate,
      fee: body.fee,
      reference: body.reference,
      notes: body.notes,
    })
  );
  const [source, dest] = await Promise.all([
    prisma.wallet.findFirst({
      where: { id: result.sourceWalletId, businessId: user.businessId },
      select: { name: true, currency: true },
    }),
    prisma.wallet.findFirst({
      where: { id: result.destWalletId, businessId: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);
  notifyAuditFeed(
    user.businessId,
    transferNotice({
      txnNo: result.txnNo,
      sourceName: source?.name ?? "Source wallet",
      destName: dest?.name ?? "Destination wallet",
      sourceAmount: result.sourceAmount,
      sourceCurrency: source?.currency ?? "MMK",
      destAmount: result.destAmount,
      destCurrency: dest?.currency ?? "MMK",
      createdByName: user.name,
      notes: result.notes,
    }), undefined, user.id
  );
  return json(result, { status: 201 });
});

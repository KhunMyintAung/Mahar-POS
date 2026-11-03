import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { todayBusinessDate, dateRangeUtc } from "@/lib/dates";
import { MONEY_SERVICE_KINDS, recordMoneyService } from "@/services/moneyService";
import { moneyServiceNotice, notifyAuditFeed } from "@/lib/telegramNotify";

/** Money transfers and cash-outs done for customers, newest first, with today's totals. */
export const GET = withAuth("wallet.transfer", async ({ req, user }) => {
  const { skip, take, page, pageSize } = pagination(req);
  const where = { businessId: user.businessId };
  const [records, total, today] = await Promise.all([
    prisma.moneyService.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.moneyService.count({ where }),
    prisma.moneyService.groupBy({
      by: ["kind"],
      where: { ...where, voidedAt: null, createdAt: dateRangeUtc(todayBusinessDate()) },
      _sum: { amount: true, fee: true },
      _count: true,
    }),
  ]);
  return json({
    records, total, page, pageSize,
    today: today.map((t) => ({ kind: t.kind, count: t._count, amount: t._sum.amount ?? 0n, fee: t._sum.fee ?? 0n })),
  });
});

const schema = z.object({
  kind: z.enum(MONEY_SERVICE_KINDS),
  accountWalletId: z.string().min(1),
  cashWalletId: z.string().min(1),
  amount: z.string().min(1),
  fee: z.string().default("0"),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(30).optional(),
  note: z.string().max(280).optional(),
});

export const POST = withAuth("wallet.transfer", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const record = await prisma.$transaction((tx) =>
    recordMoneyService(tx, {
      businessId: user.businessId,
      userId: user.id,
      kind: body.kind,
      accountWalletId: body.accountWalletId,
      cashWalletId: body.cashWalletId,
      amount: toMinor(body.amount),
      fee: toMinor(body.fee || "0"),
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      note: body.note,
    })
  );
  notifyAuditFeed(user.businessId, moneyServiceNotice({
    kind: record.kind, txnNo: record.txnNo, accountName: record.accountName, cashName: record.cashName,
    amount: record.amount, fee: record.fee, customer: [record.customerName, record.customerPhone].filter(Boolean).join(" "), createdByName: user.name,
  }), undefined, user.id);
  return json(record, { status: 201 });
});

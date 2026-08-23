import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createSale } from "@/services/posService";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { notifyAuditFeed, saleNotice } from "@/lib/telegramNotify";

export const GET = withAuth("sale.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(sp.get("date") ? { date: sp.get("date")! } : {}),
    ...(sp.get("status") ? { status: sp.get("status")! } : {}),
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")! } }, { reference: { contains: sp.get("q")! } }] } : {}),
  };
  const [sales, total, agg] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { lines: { include: { item: { select: { name: true, sku: true } } } } },
      orderBy: { createdAt: "desc" },
      skip, take,
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { total: true, profit: true },
    }),
  ]);
  const customerIds = [...new Set(sales.map((s) => s.customerId).filter(Boolean))] as string[];
  const customers = await prisma.contact.findMany({
    where: { id: { in: customerIds }, businessId: user.businessId },
    select: { id: true, name: true },
  });
  const byId = new Map(customers.map((c) => [c.id, c.name]));
  return json({
    sales: sales.map((s) => ({ ...s, customerName: s.customerId ? byId.get(s.customerId) : undefined })),
    total, page, pageSize,
    totals: { amount: agg._sum.total ?? 0n, profit: agg._sum.profit ?? 0n },
  });
});

const lineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.string().min(1),
});

const schema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  lines: z.array(lineSchema).min(1),
  discount: z.string().default("0"),
  paidAmount: z.string().min(1),
  walletId: z.string().optional(),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("sale.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);

  const sale = await prisma.$transaction(async (tx) =>
    createSale(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      date: body.date,
      customerId: body.customerId,
      lines: body.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: toMinor(l.unitPrice) })),
      discount: toMinor(body.discount),
      paidAmount: toMinor(body.paidAmount),
      walletId: body.walletId,
      dueDate: body.dueDate,
      reference: body.reference,
      notes: body.notes,
    })
  );
  notifyAuditFeed(
    user.businessId,
    saleNotice({
      txnNo: sale.txnNo,
      total: sale.total,
      profit: sale.profit,
      createdByName: user.name,
      items: sale.soldItems,
      notes: sale.notes,
    })
  );
  return json(sale, { status: 201 });
});

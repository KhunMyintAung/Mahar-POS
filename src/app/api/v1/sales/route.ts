import { z } from "zod";
import { withAuth, json, parseBody, pagination, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { canSeeCost } from "@/lib/permissions";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createSale } from "@/services/posService";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { offlineSaleProblem } from "@/lib/offlineSale";
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
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")!, mode: "insensitive" as const } }, { reference: { contains: sp.get("q")!, mode: "insensitive" as const } }] } : {}),
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
  // The cashier's name goes on a reprinted slip, as it did on the original.
  const cashierIds = [...new Set(sales.map((s) => s.createdById))];
  const cashiers = await prisma.user.findMany({
    where: { id: { in: cashierIds }, businessId: user.businessId },
    select: { id: true, name: true },
  });
  const cashierById = new Map(cashiers.map((c) => [c.id, c.name]));
  // The IMEIs each line sold, so a reprint shows them as the original slip did.
  const serials = await prisma.itemSerial.findMany({
    where: { businessId: user.businessId, saleId: { in: sales.map((s) => s.id) } },
    select: { saleLineId: true, imei: true },
  });
  const imeisByLine = new Map<string, string[]>();
  for (const u of serials) if (u.saleLineId) imeisByLine.set(u.saleLineId, [...(imeisByLine.get(u.saleLineId) ?? []), u.imei]);
  // Profit and unit cost go to those who may see costs; a cashier gets 0 and the page shows "—".
  const costs = canSeeCost(user.permissions);
  return json({
    sales: sales.map((s) => ({
      ...s,
      profit: costs ? s.profit : 0n,
      lines: s.lines.map((l) => ({ ...l, unitCost: costs ? l.unitCost : 0n, imeis: imeisByLine.get(l.id) ?? [] })),
      customerName: s.customerId ? byId.get(s.customerId) : undefined,
      cashierName: cashierById.get(s.createdById),
    })),
    total, page, pageSize,
    totals: { amount: agg._sum.total ?? 0n, profit: agg._sum.profit ?? 0n },
  });
});

const lineSchema = z.object({
  // Empty for goods fetched from another shop (outside), which have no item of their own yet.
  itemId: z.string().default(""),
  quantity: z.number().int().positive(),
  unitPrice: z.string().min(1),
  warranty: z.string().trim().max(60).optional(),
  warrantyDays: z.number().int().min(0).max(3650).optional(),
  warrantyCondition: z.enum(["NEW", "SECOND"]).optional(),
  note: z.string().trim().max(200).optional(),
  imeis: z.array(z.string().trim().max(40)).max(500).optional(),
  outside: z.object({ name: z.string().trim().min(1).max(120), cost: z.string().min(1) }).optional(),
}).refine((l) => l.itemId || l.outside, "Each line needs an item");

const schema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  lines: z.array(lineSchema).min(1),
  discount: z.string().default("0"),
  paidAmount: z.string().min(1),
  walletId: z.string().optional(),
  // A payment split across wallets, e.g. half cash and half a mobile wallet. When given,
  // the amounts must add up to paidAmount.
  payments: z.array(z.object({ walletId: z.string().min(1), amount: z.string().min(1) })).max(4).optional(),
  // How the other shop is paid for outside lines: out of a wallet now, or owed to them.
  outsidePay: z.object({ walletId: z.string().optional(), supplierName: z.string().trim().max(80).optional() }).optional(),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  // The till's own id for this sale, sent with every sale: when the reply is lost on a weak
  // connection and the till sends it again, it is recorded once.
  clientRef: z.string().trim().min(8).max(64).optional(),
  // A sale rung up at the till without the internet and sent later: when it was made (it
  // belongs to that day). The device's id for it may come here too (the first offline tills).
  offline: z.object({
    clientRef: z.string().trim().min(8).max(64).optional(),
    at: z.string().datetime(),
  }).optional(),
});

export const POST = withAuth("sale.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);
  const clientRef = body.clientRef ?? body.offline?.clientRef;

  // Sent before and recorded: the reply was lost, so answer with the sale already made.
  const alreadySent = async () => {
    if (!clientRef) return null;
    const done = await prisma.sale.findFirst({
      where: { businessId: user.businessId, clientRef },
      select: { id: true, txnNo: true, total: true, profit: true },
    });
    return done && json({ ...done, profit: canSeeCost(user.permissions) ? done.profit : 0n, duplicate: true });
  };
  if (clientRef) {
    const done = await alreadySent();
    if (done) return done;
  }
  if (body.offline) {
    const problem = offlineSaleProblem(new Date(body.offline.at), body.date);
    if (problem) throw new ApiError(422, problem);
  }

  let sale: Awaited<ReturnType<typeof createSale>>;
  try {
    sale = await prisma.$transaction(async (tx) => createSale(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      date: body.date,
      customerId: body.customerId,
      lines: body.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        unitPrice: toMinor(l.unitPrice),
        warranty: l.warranty || undefined,
        warrantyDays: l.warrantyDays,
        warrantyCondition: l.warrantyCondition,
        note: l.note || undefined,
        imeis: l.imeis,
        outside: l.outside ? { name: l.outside.name, cost: toMinor(l.outside.cost) } : undefined,
      })),
      discount: toMinor(body.discount),
      paidAmount: toMinor(body.paidAmount),
      walletId: body.walletId,
      payments: body.payments?.map((p) => ({ walletId: p.walletId, amount: toMinor(p.amount) })),
      outsidePay: body.outsidePay,
      clientRef,
      offlineAt: body.offline ? new Date(body.offline.at) : undefined,
      dueDate: body.dueDate,
      reference: body.reference,
      notes: body.notes,
    }));
  } catch (error) {
    // The same offline sale sent twice at once: the other send recorded it.
    if (clientRef && (error as { code?: string })?.code === "P2002") {
      const done = await alreadySent();
      if (done) return done;
    }
    throw error;
  }
  notifyAuditFeed(
    user.businessId,
    saleNotice({
      txnNo: sale.txnNo,
      total: sale.total,
      profit: sale.profit,
      createdByName: user.name,
      items: sale.soldItems,
      notes: sale.notes,
    }), undefined, user.id
  );
  return json(sale, { status: 201 });
});

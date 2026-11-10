import { z } from "zod";
import { CURRENCIES } from "@/lib/currency";
import { businessCurrency } from "@/services/currencyService";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { agingBucket, createReceivable } from "@/services/creditService";
import { creditSalesFor } from "@/lib/creditSales";

export const GET = withAuth("credit.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const today = todayBusinessDate();
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(sp.get("status") ? { status: sp.get("status")! } : { status: { not: "CANCELLED" } }),
    ...(sp.get("customerId") ? { customerId: sp.get("customerId")! } : {}),
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")!, mode: "insensitive" as const } }, { reference: { contains: sp.get("q")!, mode: "insensitive" as const } }] } : {}),
  };
  // ?date=YYYY-MM-DD lists only that day's records; the outstanding total is always every day's.
  const date = sp.get("date");
  const listWhere = { ...where, ...(date && isValidBusinessDate(date) ? { creditDate: date } : {}) };
  const [items, total, agg] = await Promise.all([
    prisma.receivable.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { id: true, name: true, phone: true, address: true } }, payments: true },
      skip, take,
    }),
    prisma.receivable.count({ where: listWhere }),
    prisma.receivable.aggregate({
      where: { ...where, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] } },
      _sum: { remainingAmount: true },
    }),
  ]);
  const sales = await creditSalesFor(items.map((r) => r.id));
  const withAging = items.map((r) => ({ ...r, aging: agingBucket(r.dueDate, today), sale: sales.get(r.id) ?? null }));
  return json({ items: withAging, total, page, pageSize, totalOutstanding: agg._sum.remainingAmount ?? 0n });
});

const schema = z.object({
  /** A saved contact, or `person` for someone not saved yet — a friend, a walk-in customer. */
  customerId: z.string().min(1).optional(),
  person: z.object({ name: z.string().trim().min(1, "Enter a name").max(120), phone: z.string().trim().max(40).optional() }).optional(),
  branchId: z.string().min(1),
  amount: z.string().min(1),
  currency: z.enum(CURRENCIES).optional(),
  creditDate: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  /** A cash loan: the wallet the money was handed out from, taken out of it now. */
  walletId: z.string().min(1).optional(),
}).refine((b) => b.customerId || b.person, { message: "Choose who owes it, or type a name" });

export const POST = withAuth("credit.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);
  const rec = await prisma.$transaction(async (tx) => {
    // Someone not saved yet is saved now, as a debtor (or found again by their phone).
    let customerId = body.customerId;
    if (!customerId && body.person) {
      const phone = body.person.phone || null;
      const known = phone
        ? await tx.contact.findFirst({ where: { businessId: user.businessId, phone, deletedAt: null }, select: { id: true } })
        : null;
      customerId = known?.id ?? (await tx.contact.create({
        data: { businessId: user.businessId, name: body.person.name, phone, type: "DEBTOR" },
        select: { id: true },
      })).id;
    }
    return createReceivable(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      customerId: customerId!,
      amount: toMinor(body.amount),
      currency: body.currency ?? (await businessCurrency(user.businessId)),
      creditDate: body.creditDate,
      dueDate: body.dueDate,
      reference: body.reference,
      notes: body.notes,
      walletId: body.walletId,
    });
  });
  return json(rec, { status: 201 });
});

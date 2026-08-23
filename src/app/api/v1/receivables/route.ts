import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { agingBucket, createReceivable } from "@/services/creditService";

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
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")! } }, { reference: { contains: sp.get("q")! } }] } : {}),
  };
  const [items, total, agg] = await Promise.all([
    prisma.receivable.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true, phone: true } }, payments: true },
      skip, take,
    }),
    prisma.receivable.count({ where }),
    prisma.receivable.aggregate({
      where: { ...where, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] } },
      _sum: { remainingAmount: true },
    }),
  ]);
  const withAging = items.map((r) => ({ ...r, aging: agingBucket(r.dueDate, today) }));
  return json({ items: withAging, total, page, pageSize, totalOutstanding: agg._sum.remainingAmount ?? 0n });
});

const schema = z.object({
  customerId: z.string().min(1),
  branchId: z.string().min(1),
  amount: z.string().min(1),
  currency: z.enum(["MMK", "THB"]).default("MMK"),
  creditDate: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("credit.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);
  const rec = await prisma.$transaction((tx) =>
    createReceivable(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      customerId: body.customerId,
      amount: toMinor(body.amount),
      currency: body.currency,
      creditDate: body.creditDate,
      dueDate: body.dueDate,
      reference: body.reference,
      notes: body.notes,
    })
  );
  return json(rec, { status: 201 });
});

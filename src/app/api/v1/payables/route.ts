import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { agingBucket } from "@/services/creditService";

export const GET = withAuth("payable.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const today = todayBusinessDate();
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(sp.get("status") ? { status: sp.get("status")! } : { status: { not: "CANCELLED" } }),
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")! } }, { reference: { contains: sp.get("q")! } }] } : {}),
  };
  const [items, total, agg] = await Promise.all([
    prisma.payable.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { supplier: { select: { name: true, phone: true } }, payments: true },
      skip, take,
    }),
    prisma.payable.count({ where }),
    prisma.payable.aggregate({
      where: { ...where, status: { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] } },
      _sum: { remainingAmount: true },
    }),
  ]);
  const withAging = items.map((p) => ({ ...p, aging: agingBucket(p.dueDate, today) }));
  return json({ items: withAging, total, page, pageSize, totalOutstanding: agg._sum.remainingAmount ?? 0n });
});

const schema = z.object({
  supplierId: z.string().min(1),
  branchId: z.string().min(1),
  amount: z.string().min(1),
  currency: z.enum(["MMK", "THB"]).default("MMK"),
  payableDate: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  dueDate: z.string().optional(),
  category: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("payable.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);
  const amount = toMinor(body.amount);
  if (amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");

  const pay = await prisma.$transaction(async (tx) => {
    const supplier = await tx.contact.findUnique({ where: { id: body.supplierId } });
    if (!supplier || supplier.businessId !== user.businessId) throw new ApiError(404, "Supplier not found");

    const txnNo = await nextNumber(tx, user.businessId, "PAYABLE");
    const p = await tx.payable.create({
      data: {
        txnNo,
        businessId: user.businessId,
        branchId: body.branchId,
        supplierId: body.supplierId,
        originalAmount: amount,
        remainingAmount: amount,
        currency: body.currency,
        payableDate: body.payableDate,
        dueDate: body.dueDate,
        category: body.category,
        reference: body.reference,
        notes: body.notes,
        createdById: user.id,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "CREATE", module: "payable", resourceType: "Payable", resourceId: p.id,
      after: { txnNo, supplier: supplier.name, amount },
    });
    return p;
  });
  return json(pay, { status: 201 });
});

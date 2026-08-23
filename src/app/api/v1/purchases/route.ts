import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createPurchase } from "@/services/posService";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";

export const GET = withAuth("purchase.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(sp.get("status") ? { status: sp.get("status")! } : {}),
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")! } }, { reference: { contains: sp.get("q")! } }] } : {}),
  };
  const [purchases, total, agg] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: { lines: { include: { item: { select: { name: true, sku: true } } } } },
      orderBy: { createdAt: "desc" },
      skip, take,
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { total: true } }),
  ]);
  // attach supplier names
  const supplierIds = [...new Set(purchases.map((p) => p.supplierId).filter(Boolean))] as string[];
  const suppliers = await prisma.contact.findMany({
    where: { id: { in: supplierIds }, businessId: user.businessId },
    select: { id: true, name: true },
  });
  const byId = new Map(suppliers.map((s) => [s.id, s.name]));
  return json({
    purchases: purchases.map((p) => ({ ...p, supplierName: p.supplierId ? byId.get(p.supplierId) : undefined })),
    total, page, pageSize,
    totalAmount: agg._sum.total ?? 0n,
  });
});

const lineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.string().min(1),
});

const schema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().optional(),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  lines: z.array(lineSchema).min(1),
  discount: z.string().default("0"),
  paidAmount: z.string().default("0"),
  walletId: z.string().optional(),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("purchase.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);

  const purchase = await prisma.$transaction(async (tx) =>
    createPurchase(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      date: body.date,
      supplierId: body.supplierId,
      lines: body.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: toMinor(l.unitPrice) })),
      discount: toMinor(body.discount),
      paidAmount: toMinor(body.paidAmount),
      walletId: body.walletId,
      dueDate: body.dueDate,
      reference: body.reference,
      notes: body.notes,
    })
  );
  return json(purchase, { status: 201 });
});

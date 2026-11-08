import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { EXPIRY_FORMAT_ERROR, EXPIRY_PATTERN, expiryDate } from "@/lib/expiry";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createPurchase } from "@/services/posService";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { withPaymentsSince } from "@/lib/purchasePaid";

export const GET = withAuth("purchase.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(sp.get("status") ? { status: sp.get("status")! } : {}),
    ...(sp.get("q") ? { OR: [{ txnNo: { contains: sp.get("q")!, mode: "insensitive" as const } }, { reference: { contains: sp.get("q")!, mode: "insensitive" as const } }] } : {}),
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
  // The expense each purchase was recorded as: Sale or Service.
  const [expenses, serviceCat, paidLater] = await Promise.all([
    prisma.incomeExpense.findMany({
      where: { businessId: user.businessId, status: "COMPLETED", purchaseId: { in: purchases.map((p) => p.id) } },
      select: { purchaseId: true, categoryId: true },
    }),
    prisma.category.findFirst({ where: { businessId: user.businessId, type: "EXPENSE", systemKey: "DAILY_SERVICE" }, select: { id: true } }),
    // The part of each purchase already in expense: at purchase, and with each payment since.
    prisma.incomeExpense.groupBy({
      by: ["fromPurchaseId"],
      where: { businessId: user.businessId, status: "COMPLETED", fromPurchaseId: { in: purchases.map((p) => p.id) } },
      _sum: { amount: true },
    }),
  ]);
  const laterOf = new Map(paidLater.map((g) => [g.fromPurchaseId, g._sum.amount ?? 0n]));
  const lineOf = new Map(expenses.map((e) => [e.purchaseId, serviceCat && e.categoryId === serviceCat.id ? "SERVICE" : "SALE"]));
  return json({
    purchases: (await withPaymentsSince(user.businessId, purchases)).map((p) => ({ ...p, supplierName: p.supplierId ? byId.get(p.supplierId) : undefined, expenseLine: lineOf.get(p.id) ?? (laterOf.has(p.id) ? (p.line === "SERVICE" ? "SERVICE" : "SALE") : null), line: p.line ?? null })),
    total, page, pageSize,
    totalAmount: agg._sum.total ?? 0n,
  });
});

const lineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.string().min(1),
  imeis: z.array(z.string().trim().max(40)).max(500).optional(),
  /** Best before on this delivery (YYYY-MM-DD); it becomes the item's expiry date. */
  expiresAt: z.string().regex(EXPIRY_PATTERN, EXPIRY_FORMAT_ERROR).optional(),
});

const schema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().optional(),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  lines: z.array(lineSchema).min(1),
  discount: z.string().default("0"),
  paidAmount: z.string().default("0"),
  walletId: z.string().optional(),
  /** What it was bought for: decides the expense (Daily Sale or Daily Service). */
  line: z.enum(["SALE", "SERVICE"]).optional(),
  dueDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("purchase.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await createPurchase(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      date: body.date,
      supplierId: body.supplierId,
      lines: body.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: toMinor(l.unitPrice), imeis: l.imeis })),
      discount: toMinor(body.discount),
      paidAmount: toMinor(body.paidAmount),
      walletId: body.walletId,
      dueDate: body.dueDate,
      line: body.line,
      reference: body.reference,
      notes: body.notes,
    });
    // A new delivery brings its own best-before date, which is the one now on the shelf.
    for (const l of body.lines) {
      const expiresAt = expiryDate(l.expiresAt);
      if (expiresAt) await tx.item.updateMany({ where: { id: l.itemId, businessId: user.businessId }, data: { expiresAt } });
    }
    return created;
  });
  return json(purchase, { status: 201 });
});

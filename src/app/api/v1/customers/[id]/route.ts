import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

export const GET = withAuth("customer.view", async ({ user, params }) => {
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact || contact.businessId !== user.businessId || contact.deletedAt)
    throw new ApiError(404, "Contact not found");

  const [receivables, recAgg, payAgg] = await Promise.all([
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
  ]);
  return json({
    contact, receivables,
    currentReceivable: recAgg._sum.remainingAmount ?? 0n,
    currentPayable: payAgg._sum.remainingAmount ?? 0n,
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
});

export const PATCH = withAuth("customer.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, patchSchema);
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact || contact.businessId !== user.businessId) throw new ApiError(404, "Contact not found");

  const { creditLimit, ...rest } = body;
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.contact.update({
      where: { id: contact.id },
      data: {
        ...rest,
        ...(creditLimit !== undefined ? { creditLimit: toMinor(creditLimit) } : {}),
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

import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

export const GET = withAuth("customer.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...(sp.get("type") ? { type: sp.get("type")! } : {}),
    ...(sp.get("q")
      ? { OR: [{ name: { contains: sp.get("q")! } }, { phone: { contains: sp.get("q")! } }] }
      : {}),
  };
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { name: "asc" }, skip, take }),
    prisma.contact.count({ where }),
  ]);
  return json({ contacts, total, page, pageSize });
});

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  telegram: z.string().optional(),
  address: z.string().optional(),
  type: z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "CREDITOR", "DEBTOR", "OTHER"]).default("CUSTOMER"),
  currency: z.enum(["MMK", "THB"]).default("MMK"),
  creditLimit: z.string().default("0"),
  notes: z.string().optional(),
});

export const POST = withAuth("customer.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const contact = await prisma.$transaction(async (tx) => {
    const c = await tx.contact.create({
      data: {
        businessId: user.businessId,
        name: body.name,
        phone: body.phone,
        telegram: body.telegram,
        address: body.address,
        type: body.type,
        currency: body.currency,
        creditLimit: toMinor(body.creditLimit),
        notes: body.notes,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "customer", resourceType: "Contact", resourceId: c.id,
      after: { name: c.name, type: c.type },
    });
    return c;
  });
  return json(contact, { status: 201 });
});

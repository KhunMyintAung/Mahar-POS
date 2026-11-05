import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { CONTACT_TYPES, parseContactCsv } from "@/lib/contactCsv";

const schema = z.object({
  csv: z.string().max(2_000_000),
  /** The list it was imported into: rows with no Type take it. */
  type: z.enum(CONTACT_TYPES).default("CUSTOMER"),
});

/** Customers or suppliers from a CSV. A row whose phone (or, with no phone, name) matches a
 *  contact of the same type updates it; any other row is a new contact. Empty cells leave
 *  what is there. */
export const POST = withAuth("customer.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const parsed = parseContactCsv(body.csv, body.type);
  const existing = await prisma.contact.findMany({
    where: { businessId: user.businessId, deletedAt: null },
    select: { id: true, name: true, phone: true, type: true },
  });
  let created = 0, updated = 0;
  const rejected = [...parsed.rejected];
  for (const c of parsed.contacts) {
    const match = existing.find((e) => e.type === c.type && (c.phone ? e.phone?.replace(/[^\d+]/g, "") === c.phone : e.name.trim().toLowerCase() === c.name.toLowerCase()));
    try {
      if (match) {
        await prisma.contact.update({
          where: { id: match.id },
          data: {
            name: c.name,
            ...(c.phone ? { phone: c.phone } : {}),
            ...(c.telegram ? { telegram: c.telegram } : {}),
            ...(c.address ? { address: c.address } : {}),
            ...(c.notes ? { notes: c.notes } : {}),
            ...(c.creditLimit ? { creditLimit: toMinor(c.creditLimit) } : {}),
          },
        });
        updated += 1;
      } else {
        const n = await prisma.contact.create({
          data: {
            businessId: user.businessId, name: c.name, type: c.type, phone: c.phone || null, telegram: c.telegram || null,
            address: c.address || null, notes: c.notes || null, creditLimit: toMinor(c.creditLimit || "0"),
          },
        });
        existing.push({ id: n.id, name: n.name, phone: n.phone, type: n.type });
        created += 1;
      }
    } catch (e) {
      rejected.push({ row: c.row, raw: c.name, reason: e instanceof Error ? e.message : "Failed" });
    }
  }
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "IMPORT", module: "customer", resourceType: "Contact",
    after: { created, updated, rejected: rejected.length, type: body.type },
  });
  return json({ created, updated, rejected, unknownColumns: parsed.unknownColumns });
});

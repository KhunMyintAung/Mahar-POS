import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";
import { contactBalances } from "@/lib/contactBalances";

/** Each contact (?type=CUSTOMER|SUPPLIER…) with what they still owe the shop (open credit)
 *  and what the shop still owes them (open payables, unpaid purchases included), and how
 *  much business was done with them. Owed amounts only for those who may see credit. */
export const GET = withAuth("customer.view", async ({ req, user }) => {
  const type = req.nextUrl.searchParams.get("type") || undefined;
  const contacts = await prisma.contact.findMany({
    where: { businessId: user.businessId, deletedAt: null, ...(type ? { type } : {}) },
    select: { id: true, name: true, phone: true, type: true, telegram: true, address: true, notes: true, creditLimit: true, active: true },
    orderBy: { name: "asc" },
  });
  const rows = await contactBalances(user.businessId, contacts.map((c) => c.id), {
    receivable: can(user, "credit.view"), payable: can(user, "payable.view"),
  });
  return json(contacts.map((c) => ({ ...c, ...rows.get(c.id)! })));
});

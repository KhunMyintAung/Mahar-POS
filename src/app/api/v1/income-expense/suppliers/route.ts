import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { isValidMonth } from "@/lib/dates";

// GET ?month=YYYY-MM: what was paid to each supplier that month through expense entries,
// biggest first, each with its entries.
export const GET = withAuth("income_expense.view", async ({ req, user }) => {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isValidMonth(month)) throw new ApiError(422, "Choose a month");
  const entries = await prisma.incomeExpense.findMany({
    where: {
      businessId: user.businessId,
      deletedAt: null,
      status: "COMPLETED",
      type: "EXPENSE",
      supplierId: { not: null },
      date: { startsWith: month },
      ...branchScope(user),
    },
    select: { id: true, txnNo: true, date: true, categoryName: true, description: true, amount: true, currency: true, supplierId: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const contacts = await prisma.contact.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.supplierId!))] }, businessId: user.businessId },
    select: { id: true, name: true },
  });
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const bySupplier = new Map<string, { supplierId: string; name: string; total: bigint; entries: typeof entries }>();
  for (const e of entries) {
    const row = bySupplier.get(e.supplierId!) ?? { supplierId: e.supplierId!, name: name.get(e.supplierId!) ?? "—", total: 0n, entries: [] };
    row.total += e.amount;
    row.entries.push(e);
    bySupplier.set(e.supplierId!, row);
  }
  const suppliers = [...bySupplier.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : a.name.localeCompare(b.name)));
  return json({ month, total: suppliers.reduce((n, s) => n + s.total, 0n), suppliers });
});

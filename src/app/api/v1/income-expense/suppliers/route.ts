import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { isValidBusinessDate, isValidMonth } from "@/lib/dates";

// GET ?month=YYYY-MM, ?date=YYYY-MM-DD or ?all=1: what was paid to each supplier in that
// period through expense entries, biggest first, each with its entries.
export const GET = withAuth("income_expense.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") ?? "";
  const date = sp.get("date") ?? "";
  const period = isValidMonth(month) ? { startsWith: month }
    : isValidBusinessDate(date) ? date
    : sp.get("all") === "1" ? undefined
    : null;
  if (period === null) throw new ApiError(422, "Choose a month");
  const entries = await prisma.incomeExpense.findMany({
    where: {
      businessId: user.businessId,
      deletedAt: null,
      status: "COMPLETED",
      type: "EXPENSE",
      supplierId: { not: null },
      ...(period === undefined ? {} : { date: period }),
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
  return json({ month: month || date || "all", total: suppliers.reduce((n, s) => n + s.total, 0n), suppliers });
});

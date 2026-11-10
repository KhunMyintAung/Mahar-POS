import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { dateRangeUtc, isValidBusinessDate } from "@/lib/dates";

// GET ?date=YYYY-MM-DD: the money the app already counts for that day (repair money taken, till
// sales) and the Daily Service / Daily Sale income already entered by hand. Shown in the income
// form, so a day's total typed from a notebook does not count that money a second time.
export const GET = withAuth("income_expense.create", async ({ req, user }) => {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!isValidBusinessDate(date)) throw new ApiError(422, "Choose a day");
  const where = { businessId: user.businessId, ...branchScope(user) };
  const [repair, sales, keyed] = await Promise.all([
    prisma.walletLedgerEntry.findMany({
      where: { ...where, createdAt: dateRangeUtc(date), refType: { in: ["REPAIR_DEPOSIT", "REPAIR_PAYMENT"] }, wallet: { currency: "MMK" } },
      select: { direction: true, amount: true, refId: true },
    }),
    prisma.sale.aggregate({ where: { ...where, deletedAt: null, status: "COMPLETED", date }, _sum: { total: true }, _count: true }),
    prisma.category.findMany({ where: { businessId: user.businessId, type: "INCOME", systemKey: { in: ["DAILY_SERVICE", "DAILY_SALE"] } }, select: { name: true, systemKey: true } }),
  ]);
  const typed = await prisma.incomeExpense.groupBy({
    by: ["categoryName"],
    where: { ...where, deletedAt: null, status: "COMPLETED", type: "INCOME", currency: "MMK", billerTxnId: null, date, categoryName: { in: keyed.map((k) => k.name) } },
    _sum: { amount: true },
  });
  // Purchases paid from a wallet that day: that money already left the wallet with the
  // purchase, so a Daily Sale / Service Expense typed for it takes it out a second time.
  // One already put into expense from the purchase itself moves no money and is left out.
  const paidPurchases = await prisma.purchase.findMany({
    where: { ...where, status: "COMPLETED", deletedAt: null, date, paidAmount: { gt: 0n } },
    select: { id: true, txnNo: true, paidAmount: true, supplierId: true },
  });
  const linked = new Set((await prisma.incomeExpense.findMany({
    // A link since cancelled no longer counts: the purchase is back to not being in expense.
    where: { businessId: user.businessId, deletedAt: null, status: "COMPLETED", purchaseId: { in: paidPurchases.map((p) => p.id) } },
    select: { purchaseId: true },
  })).map((e) => e.purchaseId));
  const open = paidPurchases.filter((p) => !linked.has(p.id));
  const supplierIds = [...new Set(open.map((p) => p.supplierId).filter((x): x is string => Boolean(x)))];
  const supplierName = new Map((supplierIds.length
    ? await prisma.contact.findMany({ where: { businessId: user.businessId, id: { in: supplierIds } }, select: { id: true, name: true } })
    : []).map((c) => [c.id, c.name]));
  const typedFor = (key: string) =>
    typed.filter((t) => keyed.find((k) => k.name === t.categoryName)?.systemKey === key).reduce((n, t) => n + (t._sum.amount ?? 0n), 0n);
  return json({
    date,
    repair: {
      amount: repair.reduce((n, l) => n + (l.direction === "DEBIT" ? l.amount : -l.amount), 0n),
      jobs: new Set(repair.map((l) => l.refId)).size,
      entered: typedFor("DAILY_SERVICE"),
    },
    sales: { amount: sales._sum.total ?? 0n, count: sales._count, entered: typedFor("DAILY_SALE") },
    purchases: open.map((p) => ({ txnNo: p.txnNo, paid: p.paidAmount, supplier: p.supplierId ? supplierName.get(p.supplierId) ?? null : null })),
  });
});

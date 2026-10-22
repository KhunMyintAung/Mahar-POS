import { prisma } from "./prisma";
import { addDays, isValidBusinessDate, isValidMonth, todayBusinessDate } from "./dates";
import { ApiError } from "./api";
import type { Report } from "@/services/reportService";
import type { Cell, Sheet } from "./xlsx";

/** Shared by the Excel download and the Google Sheet backup, so both carry the same
 *  sheets: a summary, the day-by-day (or month-by-month) table, then one sheet each for
 *  income, expenses, items sold, repairs and wallets, and the raw sales and entries. */

export type PeriodKind = "day" | "month" | "year" | "range";

/** The dates a report covers. day: YYYY-MM-DD, month: YYYY-MM, year: YYYY, range: from/to. */
export function resolvePeriod(kind: string | null, value: string | null, from?: string | null, to?: string | null) {
  const today = todayBusinessDate();
  if (kind === "range") {
    if (!from || !to || !isValidBusinessDate(from) || !isValidBusinessDate(to) || from > to) throw new ApiError(422, "Pick a valid date range");
    if (addDays(from, 731) < to) throw new ApiError(422, "A range can be at most two years");
    return { kind: "range" as const, from, to, label: `${from} – ${to}` };
  }
  if (kind === "year") {
    const y = value && /^\d{4}$/.test(value) ? value : today.slice(0, 4);
    return { kind: "year" as const, from: `${y}-01-01`, to: `${y}-12-31`, label: y };
  }
  if (kind === "day") {
    const d = value && isValidBusinessDate(value) ? value : today;
    return { kind: "day" as const, from: d, to: d, label: d };
  }
  const m = value && isValidMonth(value) ? value : today.slice(0, 7);
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { kind: "month" as const, from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}`, label: m };
}

const n = (minor: bigint) => Number(minor) / 100;

export function reportSheets(r: Report, title: string): Sheet[] {
  const t = r.totals;
  const s = r.settings;
  const summary: Cell[][] = [
    [title, "MMK"],
    ["Period", `${r.from} – ${r.to}`],
    [],
    ["INCOME (ဝင်ငွေ)", ""],
    ["Sales (အရောင်း)", n(t.sales)],
    ["Service / repair (ဝန်ဆောင်မှု)", n(t.service)],
    ["Top-up & bill (ဖုန်းဖြည့်)", n(t.topup)],
    ["Other income (အခြားဝင်ငွေ)", n(t.otherIncome)],
    ["Total income (စုစုပေါင်းဝင်ငွေ)", n(t.totalIncome)],
    [],
    ["PROFIT (အမြတ်)", ""],
    ["Sales", n(t.sales)],
    ["− Cost of goods sold (ကုန်ကျစရိတ်)", -n(t.salesCost)],
    ["Sales profit", n(t.sales - t.salesCost)],
    ["+ Service / repair", n(t.service)],
    ["+ Top-up margin (ဖုန်းဖြည့်အမြတ်)", n(t.topupMargin)],
    ["+ Other income", n(t.otherIncome)],
    ["− Repair parts used", -n(t.repairParts)],
    ["Gross profit (အကြမ်းအမြတ်)", n(t.grossProfit)],
    ["− Expenses (အသုံးစရိတ်)", -n(t.expense)],
  ];
  if (s.salaryCategories.length || t.salary) summary.push(["− Staff salary (ဝန်ထမ်းလစာ)", -n(t.salary)]);
  summary.push(["NET PROFIT (အသားတင်အမြတ်)", n(t.netProfit)]);
  if (s.showShares) {
    summary.push(["− Shares / owner drawings (ရှယ်ယာ / ထုတ်ယူငွေ)", -n(t.shares)]);
    summary.push(["Kept in the business", n(t.netProfit - t.shares)]);
  }
  summary.push(
    [],
    ["CASH FLOW (ငွေအဝင်အထွက်)", ""],
    ["Money in (MMK wallets)", n(t.cashIn)],
    ["Money out (MMK wallets)", -n(t.cashOut)],
    ["NET CASH FLOW", n(t.netCash)],
    [],
    ["Sales count", t.saleCount],
    ["Stock bought (purchases)", n(r.purchases.total)],
    ["Purchases count", r.purchases.count],
  );
  const boldLabels = new Set(["INCOME (ဝင်ငွေ)", "PROFIT (အမြတ်)", "CASH FLOW (ငွေအဝင်အထွက်)", "Total income (စုစုပေါင်းဝင်ငွေ)", "Gross profit (အကြမ်းအမြတ်)", "NET PROFIT (အသားတင်အမြတ်)", "NET CASH FLOW"]);

  const head = [r.groupBy === "day" ? "Date" : "Month", "Sales", "Service", "Top-up", "Other income", "Total income", "Cost of goods", "Gross profit", "Expenses",
    ...(s.salaryCategories.length || t.salary ? ["Staff salary"] : []), "Net profit", ...(s.showShares ? ["Shares"] : []), "Money in", "Money out", "Net cash"];
  const line = (x: Report["rows"][number], label: string): Cell[] => [label, n(x.sales), n(x.service), n(x.topup), n(x.otherIncome), n(x.totalIncome), n(x.salesCost), n(x.grossProfit), n(x.expense),
    ...(s.salaryCategories.length || t.salary ? [n(x.salary)] : []), n(x.netProfit), ...(s.showShares ? [n(x.shares)] : []), n(x.cashIn), n(x.cashOut), n(x.netCash)];
  const breakdown = [head, ...r.rows.map((x) => line(x, x.period)), line(t, "TOTAL")];

  return [
    { name: "Summary", rows: summary, boldRows: summary.map((row, i) => (boldLabels.has(String(row[0])) ? i : -1)).filter((i) => i > 0) },
    { name: r.groupBy === "day" ? "Daily" : "Monthly", rows: breakdown, boldRows: [breakdown.length - 1] },
    { name: "Income by category", rows: [["Category", "Amount"], ...r.incomeByCategory.map((c) => [c.name, n(c.amount)])] },
    { name: "Expenses by category", rows: [["Category", "Amount", "Staff salary"], ...r.expenseByCategory.map((c) => [c.name, n(c.amount), c.salary ? "Yes" : ""])] },
    { name: "Sales by item", rows: [["Item", "Qty", "Sales", "Cost", "Profit"], ...r.salesByItem.map((i) => [i.name, i.quantity, n(i.revenue), n(i.cost), n(i.profit)])] },
    { name: "Repairs", rows: [["", "Count"], ["Taken in", r.repairs.received], ["Finished", r.repairs.finished], ["Delivered", r.repairs.delivered], ["Cancelled", r.repairs.cancelled], ["Money collected (MMK)", n(r.repairs.collected)]] },
    { name: "Wallets", rows: [["Wallet", "Currency", "Opening", "Money in", "Money out", "Closing"], ...r.wallets.map((w) => [w.name, w.currency, n(w.opening), n(w.moneyIn), n(w.moneyOut), n(w.closing)])] },
  ];
}

/** Every sale and every income / expense entry of the period, line by line. */
export async function detailSheets(businessId: string, from: string, to: string, branchIds?: string[]): Promise<Sheet[]> {
  const branch = branchIds ? { branchId: { in: branchIds } } : {};
  const [sales, entries] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 20000,
      select: { txnNo: true, date: true, total: true, totalCost: true, profit: true, customerId: true, lines: { select: { quantity: true, item: { select: { name: true } } } } },
    }),
    prisma.incomeExpense.findMany({
      where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 20000,
      select: { date: true, type: true, categoryName: true, amount: true, currency: true, description: true },
    }),
  ]);
  const customerIds = [...new Set(sales.map((x) => x.customerId).filter((x): x is string => Boolean(x)))];
  const customers = new Map((await prisma.contact.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return [
    {
      name: "Sales list",
      rows: [["Date", "Voucher", "Customer", "Items", "Total", "Cost", "Profit"],
        ...sales.map((x) => [x.date, x.txnNo, (x.customerId && customers.get(x.customerId)) || "Walk-in", x.lines.map((l) => `${l.item.name} ×${l.quantity}`).join(", "), n(x.total), n(x.totalCost), n(x.profit)])],
    },
    {
      name: "Income-Expense list",
      rows: [["Date", "Type", "Category", "Amount", "Currency", "Note"],
        ...entries.map((e) => [e.date, e.type === "WITHDRAW" ? "SHARE / DRAWING" : e.type, e.categoryName ?? "", n(e.amount), e.currency, e.description ?? ""])],
    },
  ];
}

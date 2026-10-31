import { prisma } from "./prisma";
import { branchScope, type AuthUser } from "./auth";
import { buildReport } from "@/services/reportService";

/** What the Telegram AI helper may look up about the shop.
 *
 *  Read-only, every one of them: the helper answers and advises, it never records or
 *  changes anything. Each tool checks the same permission the matching app page needs and
 *  keeps to the user's own branches, so the helper never shows someone more than the app
 *  would. Amounts go out in kyats, not the minor units the database keeps. */

export interface AiTool {
  name: string;
  description: string;
  /** JSON Schema, in the subset both OpenAI and Gemini accept. */
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

const DATE = { type: "string", description: "YYYY-MM-DD" };

export const AI_TOOLS: AiTool[] = [
  {
    name: "shop_report",
    description:
      "Income, expenses and profit for a date range: totals by part of the shop (sales, service/repair, top-up, general), " +
      "best-selling items, income and expense by category, repairs taken in and finished, and each wallet's opening and closing balance.",
    parameters: { type: "object", properties: { from: DATE, to: DATE }, required: ["from", "to"] },
  },
  {
    name: "stock_list",
    description: "Items in stock with quantity, cost and selling price. Can search by name, or list only items at or below their minimum stock.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Part of the item name, optional" },
        low_only: { type: "boolean", description: "Only items at or below their minimum stock" },
      },
    },
  },
  {
    name: "debts",
    description: "Unpaid debts: customers_owe lists customers who owe the shop; we_owe lists suppliers the shop still has to pay.",
    parameters: {
      type: "object",
      properties: { kind: { type: "string", enum: ["customers_owe", "we_owe"] } },
      required: ["kind"],
    },
  },
  {
    name: "open_repairs",
    description: "Phones still in the shop for repair (not yet handed back or cancelled), with status, technician, charge and days in the shop.",
    parameters: { type: "object", properties: {} },
  },
];

const ks = (minor: bigint) => Number(minor / 100n);
const can = (user: AuthUser, perm: string) => user.permissions.includes(perm);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Runs one tool call and returns what to hand back to the model. Never throws for a bad
 *  call: the model reads the error and can try again or tell the user. */
export async function runAiTool(user: AuthUser, name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === "shop_report") return await shopReport(user, args);
    if (name === "stock_list") return await stockList(user, args);
    if (name === "debts") return await debts(user, args);
    if (name === "open_repairs") return await openRepairs(user);
    return { error: `Unknown tool ${name}` };
  } catch (e) {
    console.error(`[ai tool] ${name} failed:`, e);
    return { error: "Could not read this data right now." };
  }
}

const denied = (what: string) => ({ error: `This user has no permission to see ${what}.` });

async function shopReport(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "report.view")) return denied("reports");
  const { from, to } = args;
  if (!isDate(from) || !isDate(to) || from > to) return { error: "from and to must be YYYY-MM-DD, from not after to." };
  const r = await buildReport(user.businessId, from, to, user.allBranches ? undefined : user.branchIds);
  const t = r.totals;
  return {
    from, to, currency: "MMK",
    sale_count: t.saleCount,
    sections: r.sections.map((s) => ({
      section: s.section,
      income: s.income.map((i) => ({ label: i.label, amount: ks(i.amount) })),
      expense: s.expense.map((e) => ({ label: e.label, amount: ks(e.amount) })),
      profit: ks(s.profit),
    })),
    total_income: ks(t.totalIncome),
    gross_profit: ks(t.grossProfit),
    net_profit: ks(t.netProfit),
    salary: ks(t.salary),
    best_selling_items: r.salesByItem.slice(0, 15).map((i) => ({
      name: i.name, quantity: i.quantity, revenue: ks(i.revenue), profit: ks(i.profit),
    })),
    income_by_category: r.incomeByCategory.map((c) => ({ name: c.name, amount: ks(c.amount) })),
    expense_by_category: r.expenseByCategory.map((c) => ({ name: c.name, amount: ks(c.amount) })),
    repairs: { ...r.repairs, collected: ks(r.repairs.collected) },
    wallets: r.wallets.map((w) => ({
      name: w.name, currency: w.currency, opening: ks(w.opening), money_in: ks(w.moneyIn), money_out: ks(w.moneyOut), closing: ks(w.closing),
    })),
    purchases: { count: r.purchases.count, total: ks(r.purchases.total) },
  };
}

async function stockList(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "stock.view") && !can(user, "item.view")) return denied("stock");
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const items = await prisma.item.findMany({
    where: {
      businessId: user.businessId, active: true, deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    select: {
      name: true, costPrice: true, sellingPrice: true, minStock: true,
      stockLevels: { where: branchScope(user), select: { quantity: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  let rows = items.map((i) => ({
    name: i.name,
    quantity: i.stockLevels.reduce((s, l) => s + l.quantity, 0),
    min_stock: i.minStock,
    cost: ks(i.costPrice),
    price: ks(i.sellingPrice),
  }));
  if (args.low_only === true) rows = rows.filter((r) => r.quantity <= r.min_stock);
  return { item_count: rows.length, items: rows.slice(0, 80), more: Math.max(0, rows.length - 80) };
}

async function debts(user: AuthUser, args: Record<string, unknown>) {
  const open = { in: ["UNPAID", "PARTIAL", "OVERDUE"] };
  if (args.kind === "we_owe") {
    if (!can(user, "payable.view")) return denied("payables");
    const rows = await prisma.payable.findMany({
      where: { businessId: user.businessId, deletedAt: null, status: open, ...branchScope(user) },
      select: { remainingAmount: true, currency: true, payableDate: true, dueDate: true, supplier: { select: { name: true } } },
      orderBy: { remainingAmount: "desc" },
      take: 60,
    });
    return rows.map((r) => ({ supplier: r.supplier.name, remaining: ks(r.remainingAmount), currency: r.currency, since: r.payableDate, due: r.dueDate }));
  }
  if (!can(user, "credit.view")) return denied("customer credit");
  const rows = await prisma.receivable.findMany({
    where: { businessId: user.businessId, deletedAt: null, status: open, ...branchScope(user) },
    select: { remainingAmount: true, currency: true, creditDate: true, dueDate: true, customer: { select: { name: true } } },
    orderBy: { remainingAmount: "desc" },
    take: 60,
  });
  return rows.map((r) => ({ customer: r.customer.name, remaining: ks(r.remainingAmount), currency: r.currency, since: r.creditDate, due: r.dueDate }));
}

async function openRepairs(user: AuthUser) {
  if (!can(user, "repair.view")) return denied("repairs");
  const jobs = await prisma.repairJob.findMany({
    where: { businessId: user.businessId, deletedAt: null, status: { notIn: ["DELIVERED", "CANCELLED"] }, ...branchScope(user) },
    select: {
      jobNo: true, deviceBrand: true, deviceModel: true, problem: true, status: true, technicianName: true,
      estimatedCost: true, finalCost: true, paidAmount: true, receivedAt: true,
    },
    orderBy: { receivedAt: "asc" },
    take: 80,
  });
  const now = Date.now();
  return jobs.map((j) => {
    const charge = j.finalCost > 0n ? j.finalCost : j.estimatedCost;
    return {
      job: j.jobNo, device: `${j.deviceBrand} ${j.deviceModel}`.trim(), problem: j.problem, status: j.status,
      technician: j.technicianName, charge: ks(charge), paid: ks(j.paidAmount),
      days_in_shop: Math.floor((now - j.receivedAt.getTime()) / 86_400_000),
    };
  });
}

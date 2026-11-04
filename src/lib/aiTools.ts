import { prisma } from "./prisma";
import { branchScope, type AuthUser } from "./auth";
import { buildReport } from "@/services/reportService";
import { canSeeCost } from "./permissions";

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
    description:
      "Items with quantity in stock, cost, selling price and category. search matches any of its words against the item's name, " +
      "category, model, variant, SKU, barcode and description; when nothing matches, close_matches lists items with similar names " +
      "(for typos) and categories lists the shop's item categories. Can also list only items at or below their minimum stock.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Words to look for (item name, category, model, SKU...), optional" },
        low_only: { type: "boolean", description: "Only items at or below their minimum stock" },
      },
    },
  },
  {
    name: "sales",
    description:
      "Sales (POS receipts) in a date range: totals, each item sold with quantity, revenue and profit, and the receipts " +
      "(number, date, customer, items, total, paid). search narrows to receipts with an item or customer whose name holds any of its words.",
    parameters: { type: "object", properties: { from: DATE, to: DATE, search: { type: "string", description: "Item or customer name, optional" } }, required: ["from", "to"] },
  },
  {
    name: "purchases",
    description: "Stock purchases in a date range: each purchase with supplier, items, total and how much was paid.",
    parameters: { type: "object", properties: { from: DATE, to: DATE }, required: ["from", "to"] },
  },
  {
    name: "income_expense",
    description: "Income and expense entries in a date range (not cancelled): date, type, category, amount and note, with totals by category.",
    parameters: {
      type: "object",
      properties: { from: DATE, to: DATE, type: { type: "string", enum: ["INCOME", "EXPENSE", "WITHDRAW"] } },
      required: ["from", "to"],
    },
  },
  {
    name: "wallets",
    description: "Every wallet (cash, KBZPay, Wave, bank...) with its balance right now.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "billers",
    description: "Top-up billers (phone credit, e-load, bill payment accounts) with their balance right now and their commission rates.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "customers",
    description: "Find customers or suppliers by name or phone: phone, address, and what they owe the shop or the shop owes them.",
    parameters: { type: "object", properties: { search: { type: "string", description: "Name or phone, optional" } } },
  },
  {
    name: "find_repair",
    description:
      "Find repair jobs in any status (also handed back or cancelled) by job number, customer name or phone, device or IMEI. " +
      "Gives status, problem, technician, charge, paid, and the dates taken in, finished and handed back.",
    parameters: { type: "object", properties: { search: { type: "string", description: "Job number, customer, phone, device or IMEI" } }, required: ["search"] },
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
    if (name === "sales") return await salesIn(user, args);
    if (name === "purchases") return await purchasesIn(user, args);
    if (name === "income_expense") return await incomeExpenseIn(user, args);
    if (name === "wallets") return await walletList(user);
    if (name === "billers") return await billerList(user);
    if (name === "customers") return await customerList(user, args);
    if (name === "find_repair") return await findRepair(user, args);
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

/** The words of a search, each worth matching on its own: "spare part" finds "Part" and "Spare". */
export function searchWords(search: string): string[] {
  return [...new Set(search.toLowerCase().split(/[\s,/·|-]+/).map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 6);
}

/** How alike two words are, 0 to 1, by letter pairs: forgiving of typos like "spear" for "spare". */
export function likeness(a: string, b: string): number {
  const pairs = (w: string) => { const out: string[] = []; for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2)); return out; };
  const pa = pairs(a.toLowerCase()), pb = pairs(b.toLowerCase());
  if (!pa.length || !pb.length) return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
  const left = [...pb]; let hits = 0;
  for (const p of pa) { const i = left.indexOf(p); if (i >= 0) { hits++; left.splice(i, 1); } }
  // The same letters in another order ("spear" / "spare") still count for something.
  const letters = (w: string) => [...w.toLowerCase()].sort().join("");
  const anagram = letters(a) === letters(b) ? 0.5 : 0;
  return Math.max((2 * hits) / (pa.length + pb.length), anagram);
}

/** Items whose name, model or category is closest to the search words, best first. */
export function closeMatches<T extends { name: string; extra: string }>(items: T[], words: string[], limit = 10): T[] {
  const score = (it: T) => {
    const mine = searchWords(`${it.name} ${it.extra}`);
    return words.reduce((sum, w) => sum + Math.max(0, ...mine.map((m) => likeness(w, m))), 0) / words.length;
  };
  return items.map((it) => ({ it, s: score(it) })).filter((x) => x.s >= 0.45).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.it);
}

async function stockList(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "stock.view") && !can(user, "item.view")) return denied("stock");
  const words = typeof args.search === "string" ? searchWords(args.search) : [];
  const fields = ["name", "model", "variant", "sku", "barcode", "description"] as const;
  const select = {
    name: true, model: true, variant: true, costPrice: true, sellingPrice: true, minStock: true,
    category: { select: { name: true } },
    stockLevels: { where: branchScope(user), select: { quantity: true } },
  };
  const base = { businessId: user.businessId, active: true, deletedAt: null };
  const items = await prisma.item.findMany({
    where: {
      ...base,
      ...(words.length ? {
        OR: words.flatMap((w) => [
          ...fields.map((field) => ({ [field]: { contains: w, mode: "insensitive" as const } })),
          { category: { name: { contains: w, mode: "insensitive" as const } } },
        ]),
      } : {}),
    },
    select, orderBy: { name: "asc" }, take: 500,
  });
  const rowOf = (i: (typeof items)[number]) => ({
    name: i.name,
    category: i.category?.name,
    quantity: i.stockLevels.reduce((s, l) => s + l.quantity, 0),
    min_stock: i.minStock,
    ...(canSeeCost(user.permissions) ? { cost: ks(i.costPrice) } : {}),
    price: ks(i.sellingPrice),
  });
  // Items holding more of the words come first: "spare part" puts "Spare Part X" above "Part".
  const hits = (i: (typeof items)[number]) => {
    const text = [i.name, i.model, i.variant, i.category?.name].join(" ").toLowerCase();
    return words.filter((w) => text.includes(w)).length;
  };
  let rows = [...items].sort((a, b) => hits(b) - hits(a)).map(rowOf);
  if (args.low_only === true) rows = rows.filter((r) => r.quantity <= r.min_stock);
  if (rows.length || !words.length) return { item_count: rows.length, items: rows.slice(0, 80), more: Math.max(0, rows.length - 80) };

  // Nothing holds the words: maybe a typo. Offer the closest names and the categories.
  const all = await prisma.item.findMany({ where: base, select, take: 3000 });
  const close = closeMatches(all.map((i) => ({ ...i, extra: [i.model, i.variant, i.category?.name].filter(Boolean).join(" ") })), words);
  const categories = await prisma.itemCategory.findMany({ where: { businessId: user.businessId, active: true }, select: { name: true }, orderBy: { name: "asc" }, take: 60 });
  return { item_count: 0, close_matches: close.map(rowOf), categories: categories.map((c) => c.name) };
}

/** A date range the tools accept: both days given, in order, and not more than a year. */
function rangeProblem(from: unknown, to: unknown): string | null {
  if (!isDate(from) || !isDate(to) || from > to) return "from and to must be YYYY-MM-DD, from not after to.";
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) return "Ask for a year or less at a time.";
  return null;
}

async function namesOf(businessId: string, ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter(Boolean))] as string[];
  if (!wanted.length) return new Map<string, string>();
  const rows = await prisma.contact.findMany({ where: { businessId, id: { in: wanted } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function salesIn(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "sale.view")) return denied("sales");
  const problem = rangeProblem(args.from, args.to);
  if (problem) return { error: problem };
  const words = typeof args.search === "string" ? searchWords(args.search) : [];
  const sales = await prisma.sale.findMany({
    where: { businessId: user.businessId, deletedAt: null, status: "COMPLETED", date: { gte: String(args.from), lte: String(args.to) }, ...branchScope(user) },
    select: {
      txnNo: true, date: true, customerId: true, total: true, paidAmount: true, profit: true,
      lines: { select: { quantity: true, lineTotal: true, unitCost: true, item: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const customer = await namesOf(user.businessId, sales.map((x) => x.customerId));
  const matches = (x: (typeof sales)[number]) => {
    if (!words.length) return true;
    const text = [customer.get(x.customerId ?? "") ?? "", ...x.lines.map((l) => l.item.name)].join(" ").toLowerCase();
    return words.some((w) => text.includes(w));
  };
  const shown = sales.filter(matches);
  const byItem = new Map<string, { quantity: number; revenue: bigint; profit: bigint }>();
  for (const x of shown) for (const l of x.lines) {
    const row = byItem.get(l.item.name) ?? { quantity: 0, revenue: 0n, profit: 0n };
    row.quantity += l.quantity; row.revenue += l.lineTotal; row.profit += l.lineTotal - BigInt(l.quantity) * l.unitCost;
    byItem.set(l.item.name, row);
  }
  return {
    from: args.from, to: args.to, receipt_count: shown.length,
    total: ks(shown.reduce((t, x) => t + x.total, 0n)),
    profit: ks(shown.reduce((t, x) => t + x.profit, 0n)),
    items: [...byItem.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 40)
      .map(([name, r]) => ({ name, quantity: r.quantity, revenue: ks(r.revenue), profit: ks(r.profit) })),
    receipts: shown.slice(0, 40).map((x) => ({
      no: x.txnNo, date: x.date, customer: customer.get(x.customerId ?? ""), total: ks(x.total), paid: ks(x.paidAmount),
      items: x.lines.map((l) => `${l.item.name} × ${l.quantity}`).join(", "),
    })),
    more_receipts: Math.max(0, shown.length - 40),
  };
}

async function purchasesIn(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "purchase.view")) return denied("purchases");
  const problem = rangeProblem(args.from, args.to);
  if (problem) return { error: problem };
  const rows = await prisma.purchase.findMany({
    where: { businessId: user.businessId, deletedAt: null, status: "COMPLETED", date: { gte: String(args.from), lte: String(args.to) }, ...branchScope(user) },
    select: { txnNo: true, date: true, supplierId: true, total: true, paidAmount: true, lines: { select: { quantity: true, item: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const supplier = await namesOf(user.businessId, rows.map((r) => r.supplierId));
  return {
    count: rows.length, total: ks(rows.reduce((t, r) => t + r.total, 0n)),
    purchases: rows.slice(0, 50).map((r) => ({
      no: r.txnNo, date: r.date, supplier: supplier.get(r.supplierId ?? ""), total: ks(r.total), paid: ks(r.paidAmount),
      items: r.lines.map((l) => `${l.item.name} × ${l.quantity}`).join(", "),
    })),
  };
}

async function incomeExpenseIn(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "income_expense.view")) return denied("income and expense");
  const problem = rangeProblem(args.from, args.to);
  if (problem) return { error: problem };
  const type = ["INCOME", "EXPENSE", "WITHDRAW"].includes(String(args.type)) ? String(args.type) : undefined;
  const rows = await prisma.incomeExpense.findMany({
    where: { businessId: user.businessId, deletedAt: null, status: "COMPLETED", date: { gte: String(args.from), lte: String(args.to) }, ...(type ? { type } : {}), ...branchScope(user) },
    select: { date: true, type: true, categoryName: true, amount: true, currency: true, description: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const byCategory = new Map<string, bigint>();
  for (const r of rows) { const k = `${r.type} · ${r.categoryName ?? "—"}`; byCategory.set(k, (byCategory.get(k) ?? 0n) + r.amount); }
  return {
    count: rows.length,
    by_category: [...byCategory.entries()].map(([name, amount]) => ({ name, amount: ks(amount) })),
    entries: rows.slice(0, 60).map((r) => ({ date: r.date, type: r.type, category: r.categoryName, amount: ks(r.amount), currency: r.currency, note: r.description })),
  };
}

async function walletList(user: AuthUser) {
  if (!can(user, "wallet.view")) return denied("wallets");
  const rows = await prisma.wallet.findMany({
    where: { businessId: user.businessId, deletedAt: null, active: true, ...(user.allBranches ? {} : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }) },
    select: { name: true, type: true, currency: true, currentBalance: true },
    orderBy: { name: "asc" },
  });
  return rows.map((w) => ({ name: w.name, type: w.type, currency: w.currency, balance: ks(w.currentBalance) }));
}

async function billerList(user: AuthUser) {
  if (!can(user, "biller.view")) return denied("billers");
  const rows = await prisma.biller.findMany({
    where: { businessId: user.businessId, deletedAt: null, active: true },
    select: { name: true, type: true, currency: true, currentBalance: true, sellPercent: true, refillPercent: true },
    orderBy: { name: "asc" },
  });
  return rows.map((b) => ({ name: b.name, type: b.type, currency: b.currency, balance: ks(b.currentBalance), sell_commission_percent: b.sellPercent, refill_percent: b.refillPercent }));
}

async function customerList(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "customer.view")) return denied("customers");
  const words = typeof args.search === "string" ? searchWords(args.search) : [];
  const open = { in: ["UNPAID", "PARTIAL", "OVERDUE"] };
  const rows = await prisma.contact.findMany({
    where: {
      businessId: user.businessId, deletedAt: null,
      ...(words.length ? { OR: words.flatMap((w) => [{ name: { contains: w, mode: "insensitive" as const } }, { phone: { contains: w } }]) } : {}),
    },
    select: {
      name: true, phone: true, address: true, type: true,
      receivables: { where: { deletedAt: null, status: open }, select: { remainingAmount: true } },
      payables: { where: { deletedAt: null, status: open }, select: { remainingAmount: true } },
    },
    orderBy: { name: "asc" },
    take: 40,
  });
  return rows.map((c) => ({
    name: c.name, type: c.type, phone: c.phone, address: c.address,
    owes_shop: ks(c.receivables.reduce((t, r) => t + r.remainingAmount, 0n)),
    shop_owes: ks(c.payables.reduce((t, r) => t + r.remainingAmount, 0n)),
  }));
}

async function findRepair(user: AuthUser, args: Record<string, unknown>) {
  if (!can(user, "repair.view")) return denied("repairs");
  const words = typeof args.search === "string" ? searchWords(args.search) : [];
  if (!words.length) return { error: "Say what to look for: a job number, customer, phone, device or IMEI." };
  const fields = ["jobNo", "customerName", "customerPhone", "deviceBrand", "deviceModel", "imei", "problem"] as const;
  const jobs = await prisma.repairJob.findMany({
    where: {
      businessId: user.businessId, deletedAt: null, ...branchScope(user),
      OR: words.flatMap((w) => fields.map((field) => ({ [field]: { contains: w, mode: "insensitive" as const } }))),
    },
    select: {
      jobNo: true, customerName: true, customerPhone: true, deviceBrand: true, deviceModel: true, problem: true, status: true,
      technicianName: true, estimatedCost: true, finalCost: true, paidAmount: true, receivedAt: true, completedAt: true, deliveredAt: true,
    },
    orderBy: { receivedAt: "desc" },
    take: 30,
  });
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
  return jobs.map((j) => ({
    job: j.jobNo, customer: j.customerName, phone: j.customerPhone, device: `${j.deviceBrand} ${j.deviceModel}`.trim(),
    problem: j.problem, status: j.status, technician: j.technicianName,
    charge: ks(j.finalCost > 0n ? j.finalCost : j.estimatedCost), paid: ks(j.paidAmount),
    taken_in: day(j.receivedAt), finished: day(j.completedAt), handed_back: day(j.deliveredAt),
  }));
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

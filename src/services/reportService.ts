import { prisma } from "@/lib/prisma";
import { businessDateOf, dateRangeUtc } from "@/lib/dates";
import { bucketForKey } from "@/lib/incomeCategories";
import { isPhoneShop, type FeatureVisibility } from "@/lib/modules";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { jobsPaidBetween, loadRepairFlow } from "@/services/repairProfitService";

/** The business report for any period: a day, a month, a year or a range.
 *
 *  Everything is read once for the whole period and then grouped, by day for up to two
 *  months and by month beyond that, so a year's report is a handful of queries rather
 *  than one per day. All money is BigInt minor units.
 *
 *  Profit and cash are kept apart on purpose:
 *  - Profit: what the shop earned. Sales count at their margin over cost, top-up at its
 *    margin, service and other income in full; operating expenses and staff salary come
 *    off. Spare parts taken from stock for repairs are not counted (the shop's choice). Shares (owner and partner drawings) are shown after net profit.
 *  - Sections: each part of the shop (sales, service, top-up & bill, general) has its own
 *    income and expense, and its own profit. Their sum is the profit; staff salary comes off
 *    that, then the capital kept for next month, and what is left is split among partners.
 *  - Cash flow: money that actually moved through the wallets, in and out, including
 *    buying stock, which is not an expense until the stock is sold. */

export const REPORT_SETTING = "report_settings";

export type Section = "sales" | "service" | "topup" | "general";
/** The expense line for parts bought per repair job (Settings → Repairs). */
export const REPAIR_PARTS_LABEL = "Repair parts (bought per job)";
export const SECTIONS: Section[] = ["sales", "service", "topup", "general"];

export interface Partner { name: string; percent: number }

export interface ReportSettings {
  /** Expense categories that are staff pay, shown as their own line. */
  salaryCategories: string[];
  /** Show owner and partner withdrawals as "Shares". */
  showShares: boolean;
  /** Which section general expenses (Daily General Expense and the shop's own expense
   *  categories, such as rent) come out of. "general" keeps them in a section of their own. */
  generalExpenseTo: Section;
  /** Kept back from net profit as capital for next month: a percent, or an amount (MMK)
   *  per month. */
  reserve: { mode: "percent" | "amount"; value: number };
  /** Who shares what is left. Percents of 0 for everyone mean equal shares; adding up to less
   *  than 100%, the rest is left over (the staff bonus pool). */
  partners: Partner[];
  /** Item categories listed on the Stock sheet (with their sub-categories), e.g. spare parts. */
  stockCategoryIds: string[];
  /** Which files carry the Stock sheet: the CSV / Excel download, the Google Sheet sync. */
  stockIn: { download: boolean; sheet: boolean };
  /** The Stock sheet's columns: phone brands read from the item name (Redmi, Oppo…), or one
   *  per sub-category (or category). "auto": brands in a phone shop, categories elsewhere. */
  stockColumns: "auto" | "brand" | "category";
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  salaryCategories: [], showShares: true, generalExpenseTo: "service", reserve: { mode: "percent", value: 0 }, partners: [], stockCategoryIds: [],
  stockIn: { download: false, sheet: true }, stockColumns: "auto",
};

export function parseReportSettings(raw: unknown): ReportSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ReportSettings>;
  const reserve = v.reserve && typeof v.reserve === "object" ? v.reserve : DEFAULT_REPORT_SETTINGS.reserve;
  return {
    salaryCategories: Array.isArray(v.salaryCategories) ? v.salaryCategories.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    showShares: v.showShares !== false,
    generalExpenseTo: SECTIONS.includes(v.generalExpenseTo as Section) ? (v.generalExpenseTo as Section) : DEFAULT_REPORT_SETTINGS.generalExpenseTo,
    reserve: {
      mode: reserve.mode === "amount" ? "amount" : "percent",
      value: Number.isFinite(Number(reserve.value)) && Number(reserve.value) >= 0 ? Number(reserve.value) : 0,
    },
    partners: Array.isArray(v.partners)
      ? v.partners
          .filter((p): p is Partner => Boolean(p && typeof p.name === "string" && p.name.trim()))
          .map((p) => ({ name: p.name.trim().slice(0, 60), percent: Math.max(0, Math.min(100, Number(p.percent) || 0)) }))
          .slice(0, 10)
      : [],
    stockCategoryIds: Array.isArray(v.stockCategoryIds) ? v.stockCategoryIds.filter((x): x is string => typeof x === "string").slice(0, 50) : [],
    stockIn: {
      download: v.stockIn?.download === true,
      sheet: v.stockIn?.sheet !== false,
    },
    stockColumns: v.stockColumns === "brand" || v.stockColumns === "category" ? v.stockColumns : "auto",
  };
}

/** The daily summary's columns: each section's money in and money out.
 *  Expense of a section is what it cost to earn that income: goods sold at cost, top-up cost,
 *  plus the section's own expense entries. So income − expense is the profit, before salary.
 *
 *  Sales cost and top-up cost are the row's `costOfSales` and `topupCost` (see `countCosts`). */
export function incomeExpenseOf(r: PeriodRow) {
  const income = { sales: r.sales, service: r.service, topup: r.topup, other: r.otherIncome, total: 0n };
  income.total = income.sales + income.service + income.topup + income.other;
  const expense = {
    sales: r.costOfSales + r.expSales,
    service: r.expService,
    topup: r.topupCost + r.expTopup,
    other: r.expGeneral,
    total: 0n,
  };
  expense.total = expense.sales + expense.service + expense.topup + expense.other;
  return { inc: income, exp: expense, net: income.total - expense.total };
}

export async function loadReportSettings(businessId: string): Promise<ReportSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: REPORT_SETTING } } });
  try {
    return parseReportSettings(row ? JSON.parse(row.value) : undefined);
  } catch {
    return { ...DEFAULT_REPORT_SETTINGS };
  }
}

export interface PeriodRow {
  period: string;
  sales: bigint; salesCost: bigint; service: bigint; topup: bigint; topupMargin: bigint; otherIncome: bigint;
  /** Profit of bill sales not filed as Bill Profit income (older ones), moved into otherIncome. */
  billProfit: bigint;
  expense: bigint; salary: bigint; shares: bigint;
  cashIn: bigint; cashOut: bigint;
  /** expense split by the section it comes out of (salary not included). */
  expSales: bigint; expService: bigint; expTopup: bigint; expGeneral: bigint;
  /** Float bought from billers, recorded as expense from the Biller page (no second wallet move). */
  floatBought: bigint;
  /** Stock bought, recorded as expense from the Purchases page (no second wallet move). */
  stockBought: bigint;
  /** What the sales cost, set by `countCosts`: goods sold at cost, or the stock bought once the
   *  shop records its purchases as expense. Never both, so cost is not counted twice. */
  costOfSales: bigint;
  /** What the top-up cash cost, set by `countCosts`: the operator's part of it, or the float
   *  bought once the shop records its float purchases as expense. Never both. */
  topupCost: bigint;
}

/** Day by day, which cost counts. A shop recording its stock (or float) purchases as expense
 *  counts what it bought, from the first day it did so; before that, and in a shop that never
 *  does, what was sold counts at its cost. The day the shop started is the same whatever
 *  range is reported, so the same day always shows the same profit. */
export function countCosts(r: PeriodRow, purchaseMode: boolean, floatMode: boolean) {
  r.costOfSales = purchaseMode ? r.stockBought : r.salesCost;
  r.topupCost = floatMode ? r.floatBought : r.topup - r.topupMargin;
}

/** Adds one row's amounts into another (a day into its month, or into the total). */
export function addRow(t: PeriodRow, r: PeriodRow) {
  for (const k of Object.keys(t) as (keyof PeriodRow)[]) if (k !== "period") (t[k] as bigint) += r[k] as bigint;
  return t;
}

type Finished = { totalIncome: bigint; grossProfit: bigint; netProfit: bigint; netCash: bigint } & ReturnType<typeof incomeExpenseOf>;

export interface SectionResult { section: Section; income: { label: string; amount: bigint }[]; expense: { label: string; amount: bigint }[]; profit: bigint }

export interface Distribution {
  netProfit: bigint;
  reserve: bigint;
  distributable: bigint;
  /** What the partners did not take (their percents add up to less than 100%). */
  left: bigint;
  /** Months the reserve amount was counted for. */
  months: number;
  partners: { name: string; percent: number; amount: bigint }[];
}

/** Which parts of the shop the report shows, from the shop's switched-on modules: a mini
 *  mart without Repair or Top-up Billers has no Service or Top-up columns. */
export interface ReportSections { sales: boolean; service: boolean; topup: boolean }

function sectionsFor(features: FeatureVisibility): ReportSections {
  return { sales: features.pos, service: features.repair, topup: features.biller };
}

/** Money filed under a part the shop does not run (say a Daily Service Income entry in a
 *  mini mart) is counted as Other, so totals stay whole and no empty column shows. */
function foldHidden(r: PeriodRow, shown: ReportSections) {
  if (!shown.service) {
    r.otherIncome += r.service; r.expGeneral += r.expService;
    r.service = 0n; r.expService = 0n;
  }
  if (!shown.topup) {
    // Only the margin is the shop's; the rest of top-up cash belongs to the operator.
    r.otherIncome += r.topupMargin; r.expGeneral += r.expTopup;
    r.topup = 0n; r.topupMargin = 0n; r.expTopup = 0n; r.floatBought = 0n;
  }
}

export interface Report {
  from: string; to: string; groupBy: "day" | "month";
  settings: ReportSettings;
  shown: ReportSections;
  /** A phone shop's Stock sheet is laid out by phone brand; any other shop's by category. */
  phoneShop: boolean;
  /** The Stock sheet's columns are the fixed phone brands (else one per category). */
  stockByBrand: boolean;
  rows: (PeriodRow & Finished)[];
  /** What makes up Other income, per period and for "Total": tapped open in the Daily summary. */
  otherIncomeBy: Record<string, { label: string; amount: bigint }[]>;
  /** Each repair payment (with its voucher no) and service income behind the Service
   *  column, per period and for "Total": tapped open in the Daily summary. */
  serviceBy: Record<string, { date: string; label: string; amount: bigint }[]>;
  totals: PeriodRow & Finished & { saleCount: number };
  /** Current stock of the chosen categories. */
  stock: { name: string; category: string; group: string; quantity: number; cost: bigint; value: bigint }[];
  incomeByCategory: { name: string; amount: bigint }[];
  expenseByCategory: { name: string; amount: bigint; salary: boolean }[];
  salesByItem: { name: string; quantity: number; revenue: bigint; cost: bigint; profit: bigint }[];
  repairs: { received: number; finished: number; delivered: number; cancelled: number; collected: bigint };
  wallets: { name: string; currency: string; opening: bigint; moneyIn: bigint; moneyOut: bigint; closing: bigint }[];
  purchases: { count: number; total: bigint };
  sections: SectionResult[];
  distribution: Distribution;
}

const zeroRow = (period: string): PeriodRow => ({
  period, sales: 0n, salesCost: 0n, service: 0n, topup: 0n, topupMargin: 0n, billProfit: 0n, otherIncome: 0n,
  expense: 0n, salary: 0n, shares: 0n, cashIn: 0n, cashOut: 0n,
  expSales: 0n, expService: 0n, expTopup: 0n, expGeneral: 0n, floatBought: 0n, stockBought: 0n,
  costOfSales: 0n, topupCost: 0n,
});

/** Section profits for one row (or the totals). */
/** A biller trade into its period. Only a sale brings top-up cash in, but the margin is
 *  earned on both sides: a sale above face value, and float bought below it (200,000 of
 *  credit for 194,000). A shop that sells at face value makes all of it on the refill.
 *
 *  A bill sale shows the operator's part under Top-up and its profit as Other income (Bill
 *  Profit): filed there as an income entry (`profitBooked`), or added here for older sales. */
export function addBillerTxn(r: PeriodRow, b: { kind: string; cashAmount: bigint; profit: bigint }, profitBooked = false) {
  if (b.kind === "SALE") {
    r.topup += b.cashAmount - b.profit;
    if (!profitBooked) { r.otherIncome += b.profit; r.billProfit += b.profit; }
  } else {
    r.topupMargin += b.profit;
  }
}

export function sectionsOf(r: PeriodRow): SectionResult[] {
  return [
    // The same costs as the profit, so the sections always add up to it.
    { section: "sales", income: [{ label: "Sales", amount: r.sales }], expense: [{ label: "Cost of goods sold", amount: r.costOfSales }, { label: "Sale expenses", amount: r.expSales }], profit: r.sales - r.costOfSales - r.expSales },
    { section: "service", income: [{ label: "Service / repair", amount: r.service }], expense: [{ label: "Service expenses", amount: r.expService }], profit: r.service - r.expService },
    { section: "topup", income: [{ label: "Top-up & bill margin", amount: r.topup - r.topupCost }], expense: [{ label: "Bill expenses", amount: r.expTopup }], profit: r.topup - r.topupCost - r.expTopup },
    { section: "general", income: [{ label: "General income", amount: r.otherIncome }], expense: [{ label: "General expenses", amount: r.expGeneral }], profit: r.otherIncome - r.expGeneral },
  ];
}

/** Net profit less the capital kept back, split among the partners in whole kyats. */
export function distribute(netProfit: bigint, settings: ReportSettings, months: number): Distribution {
  // Worked in whole kyats: nobody keeps or shares a fraction of a kyat.
  const positiveKs = netProfit > 0n ? netProfit / 100n : 0n;
  const pct = BigInt(Math.round(Math.min(settings.reserve.value, 100) * 100)); // hundredths of a percent
  let reserveKs = settings.reserve.mode === "percent"
    ? (positiveKs * pct + 5000n) / 10000n // rounded to the nearest kyat
    : BigInt(Math.round(settings.reserve.value)) * BigInt(months);
  if (reserveKs > positiveKs) reserveKs = positiveKs;
  const reserve = reserveKs * 100n;
  const distributable = (positiveKs - reserveKs) * 100n;
  const list = settings.partners;
  const totalPct = list.reduce((a, p) => a + p.percent, 0);
  const weights = list.map((p) => BigInt(Math.round((totalPct > 0 ? p.percent : 1) * 100)));
  const weightSum = weights.reduce((a, w) => a + w, 0n);
  const kyats = distributable / 100n;
  // Partners adding up to less than 100% take exactly their percents; the rest is left over.
  const partial = totalPct > 0 && totalPct < 99.995;
  const shares = weights.map((w) => (partial ? (kyats * w) / 10000n : weightSum > 0n ? (kyats * w) / weightSum : 0n));
  const sharedKs = partial ? (kyats * weightSum) / 10000n : kyats;
  // The kyats lost to rounding go to the first partner, so the shares add up.
  if (shares.length) shares[0] += sharedKs - shares.reduce((a, x) => a + x, 0n);
  return {
    netProfit, reserve, distributable, months, left: (kyats - (shares.length ? sharedKs : 0n)) * 100n,
    partners: list.map((p, i) => ({ name: p.name, percent: totalPct > 0 ? p.percent : Math.round(10000 / list.length) / 100, amount: shares[i] * 100n })),
  };
}

/** Day keys from one date to another, or month keys. */
function periodKeys(from: string, to: string, groupBy: "day" | "month"): string[] {
  const keys: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const day = d.toISOString().slice(0, 10);
    const key = groupBy === "day" ? day : day.slice(0, 7);
    if (keys[keys.length - 1] !== key) keys.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

// A customer's transfer or cash-out only swaps money between the drawer and the KBZPay /
// Wave account, like a transfer between the shop's own wallets; its fee is income of its own.
export const ledgerMovesCash = (refType: string) => !["TRANSFER_IN", "TRANSFER_OUT", "EXCHANGE_IN", "EXCHANGE_OUT", "OPENING", "MONEY_SERVICE"].includes(refType);

/** The type that decides whether a ledger entry is cash: a reversal of another entry takes
 *  that entry's type. (A sale or purchase cancel points at the sale, not an entry: cash.) */
export function cashTypeOf(l: { refType: string; refId: string | null }, reversedType: Map<string, string>): string {
  if (l.refType !== "REVERSAL" || !l.refId) return l.refType;
  return reversedType.get(l.refId) ?? l.refType;
}

export async function buildReport(businessId: string, from: string, to: string, branchIds?: string[]): Promise<Report> {
  const groupBy: "day" | "month" = periodKeys(from, to, "day").length > 62 ? "month" : "day";
  const keyOf = (date: string) => (groupBy === "day" ? date : date.slice(0, 7));
  const range = { gte: dateRangeUtc(from).gte, lt: dateRangeUtc(to).lt };
  const branch = branchIds ? { branchId: { in: branchIds } } : {};
  const [settings, access, repairFlow] = await Promise.all([loadReportSettings(businessId), loadModuleAccess(businessId), loadRepairFlow(businessId)]);
  const shown = sectionsFor(access.features);
  const phoneShop = isPhoneShop(access);
  const salarySet = new Set(settings.salaryCategories.map((c) => c.toLowerCase()));

  const [sales, saleLines, ledger, billerSales, entries, keyedCats, jobsIn, jobsDone, jobsDelivered, jobsCancelled, wallets, purchases] = await Promise.all([
    prisma.sale.findMany({ where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch }, select: { date: true, total: true, totalCost: true } }),
    prisma.saleLine.findMany({
      where: { sale: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch } },
      select: { quantity: true, lineTotal: true, unitCost: true, item: { select: { name: true } } },
    }),
    prisma.walletLedgerEntry.findMany({
      where: { businessId, createdAt: range, ...branch },
      select: { walletId: true, direction: true, amount: true, refType: true, refId: true, createdAt: true },
    }),
    prisma.billerTxn.findMany({ where: { businessId, voidedAt: null, kind: { in: ["SALE", "TOPUP"] }, createdAt: range, ...branch }, select: { id: true, kind: true, cashAmount: true, profit: true, createdAt: true } }),
    prisma.incomeExpense.findMany({
      where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, currency: "MMK", ...branch },
      select: { type: true, categoryName: true, amount: true, date: true, billerTxnId: true, purchaseId: true, fromPurchaseId: true },
    }),
    prisma.category.findMany({ where: { businessId, systemKey: { not: null } }, select: { name: true, type: true, systemKey: true } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, receivedAt: range } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, completedAt: range } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, deliveredAt: range } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, status: "CANCELLED", updatedAt: range } }),
    prisma.wallet.findMany({ where: { businessId, deletedAt: null, ...(branchIds ? { branchId: { in: branchIds } } : {}) }, select: { id: true, name: true, currency: true, currentBalance: true }, orderBy: { name: "asc" } }),
    prisma.purchase.aggregate({ where: { businessId, deletedAt: null, status: "COMPLETED", date: { gte: from, lte: to }, ...branch }, _sum: { total: true }, _count: true }),
  ]);

  // Worked out day by day, then added up into months: each day's cost is counted the same way
  // whatever range it is reported in, so a month is always the sum of its days.
  const rows = new Map(periodKeys(from, to, "day").map((k) => [k, zeroRow(k)]));
  const at = (date: string) => rows.get(date) ?? rows.set(date, zeroRow(date)).get(date)!;

  for (const s of sales) { const r = at(s.date); r.sales += s.total; r.salesCost += s.totalCost; }
  const mmkWallets = new Set(wallets.filter((w) => w.currency === "MMK").map((w) => w.id));
  // What the Service column is made of, line by line: each repair payment under its voucher.
  const serviceBy = new Map<string, { date: string; label: string; amount: bigint }[]>();
  const addService = (period: string, date: string, label: string, amount: bigint) => {
    if (amount === 0n) return;
    for (const key of [period, "Total"]) serviceBy.set(key, [...(serviceBy.get(key) ?? []), { date, label, amount }]);
  };
  const repairIds = [...new Set(ledger.filter((l) => (l.refType === "REPAIR_DEPOSIT" || l.refType === "REPAIR_PAYMENT") && l.refId).map((l) => l.refId!))];
  // A reversal is cash only if what it undoes was: undoing a transfer between the shop's own
  // wallets moves no money in or out of the shop, any more than the transfer did.
  const reversedIds = [...new Set(ledger.filter((l) => l.refType === "REVERSAL" && l.refId).map((l) => l.refId!))];
  const [repairJobs, reversedType] = await Promise.all([
    (repairIds.length
      ? prisma.repairJob.findMany({ where: { id: { in: repairIds } }, select: { id: true, jobNo: true, customerName: true, deviceBrand: true, deviceModel: true } })
      : Promise.resolve([])).then((list) => new Map(list.map((j) => [j.id, j]))),
    (reversedIds.length
      ? prisma.walletLedgerEntry.findMany({ where: { businessId, id: { in: reversedIds } }, select: { id: true, refType: true } })
      : Promise.resolve([])).then((list) => new Map(list.map((e) => [e.id, e.refType]))),
  ]);
  for (const l of ledger) {
    const date = businessDateOf(l.createdAt);
    const r = at(date);
    if (l.refType === "REPAIR_DEPOSIT" || l.refType === "REPAIR_PAYMENT") {
      if (mmkWallets.has(l.walletId)) {
        const amount = l.direction === "DEBIT" ? l.amount : -l.amount;
        r.service += amount;
        const job = l.refId ? repairJobs.get(l.refId) : undefined;
        const who = job ? [job.jobNo, job.customerName || `${job.deviceBrand} ${job.deviceModel}`.trim()].filter(Boolean).join(" · ") : "Repair";
        addService(keyOf(date), date, `${who} · ${l.refType === "REPAIR_DEPOSIT" ? "Deposit" : "Payment"}${amount < 0n ? " (refund)" : ""}`, amount);
      }
    }
    if (mmkWallets.has(l.walletId) && ledgerMovesCash(cashTypeOf(l, reversedType))) {
      if (l.direction === "DEBIT") r.cashIn += l.amount; else r.cashOut += l.amount;
    }
  }
  const profitBooked = new Set(entries.filter((e) => e.type === "INCOME" && e.billerTxnId).map((e) => e.billerTxnId));
  // Each day's top-up money, to show in whole thousands (below).
  const dayTopup = new Map<string, bigint>();
  const addDayTopup = (day: string, amount: bigint) => dayTopup.set(day, (dayTopup.get(day) ?? 0n) + amount);
  for (const b of billerSales) {
    const day = businessDateOf(b.createdAt);
    addBillerTxn(at(day), b, profitBooked.has(b.id));
    if (b.kind === "SALE") addDayTopup(day, b.cashAmount - b.profit);
  }
  const keyByName = new Map(keyedCats.filter((c) => c.type === "INCOME").map((c) => [c.name.toLowerCase(), c.systemKey]));
  const expenseKey = new Map(keyedCats.filter((c) => c.type === "EXPENSE").map((c) => [c.name.toLowerCase(), c.systemKey]));
  const expenseSection = (name: string): Section => {
    const k = expenseKey.get(name.toLowerCase());
    if (k === "DAILY_SALE") return "sales";
    if (k === "DAILY_SERVICE") return "service";
    if (k === "DAILY_BILL") return "topup";
    return settings.generalExpenseTo;
  };
  const incomeCats = new Map<string, bigint>();
  const expenseCats = new Map<string, bigint>();
  const otherBy = new Map<string, Map<string, bigint>>();
  const addOther = (period: string, name: string, amount: bigint) => {
    if (amount === 0n) return;
    for (const key of [period, "Total"]) {
      const m = otherBy.get(key) ?? new Map<string, bigint>();
      m.set(name, (m.get(name) ?? 0n) + amount);
      otherBy.set(key, m);
    }
  };
  for (const r of rows.values()) addOther(keyOf(r.period), "Bill Profit", r.billProfit);
  for (const e of entries) {
    const r = at(e.date);
    const name = e.categoryName ?? (e.type === "WITHDRAW" ? "Withdrawal" : "—");
    if (e.type === "INCOME") {
      const bucket = bucketForKey(keyByName.get(name.toLowerCase()));
      if (bucket === "sales") r.sales += e.amount;
      else if (bucket === "service") { r.service += e.amount; addService(keyOf(e.date), e.date, name, e.amount); }
      // Bill income is the shop's own margin, all of it: not top-up cash to round to thousands
      // (rounding it would count the odd hundreds again, as Bill Profit).
      else if (bucket === "topup") { r.topup += e.amount; r.topupMargin += e.amount; }
      else { r.otherIncome += e.amount; addOther(keyOf(e.date), name, e.amount); }
      incomeCats.set(name, (incomeCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "EXPENSE" && (e.purchaseId || e.fromPurchaseId) && expenseSection(name) === "service") {
      // A purchase bought for Service (repair parts): a service expense, not goods to sell.
      r.expense += e.amount; r.expService += e.amount;
      expenseCats.set(name, (expenseCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "EXPENSE" && (e.purchaseId || e.fromPurchaseId)) {
      r.stockBought += e.amount;
      expenseCats.set(name, (expenseCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "EXPENSE" && e.billerTxnId) {
      r.floatBought += e.amount;
      expenseCats.set(name, (expenseCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "EXPENSE") {
      if (salarySet.has(name.toLowerCase())) r.salary += e.amount;
      else {
        r.expense += e.amount;
        const sec = expenseSection(name);
        if (sec === "sales") r.expSales += e.amount;
        else if (sec === "service") r.expService += e.amount;
        else if (sec === "topup") r.expTopup += e.amount;
        else r.expGeneral += e.amount;
      }
      expenseCats.set(name, (expenseCats.get(name) ?? 0n) + e.amount);
    } else if (e.type === "WITHDRAW") {
      r.shares += e.amount;
    }
  }

  // A day's top-up shows in whole thousands, as the shop counts it; what is left over
  // (170,292 → 170,000 and 292) is the shop's, under Other income as Bill Profit.
  for (const [day, amount] of dayTopup) {
    const rest = amount > 0n ? amount % 1000_00n : 0n;
    if (rest === 0n) continue;
    const r = at(day);
    r.topup -= rest; r.otherIncome += rest; r.billProfit += rest;
    addOther(keyOf(day), "Bill Profit", rest);
  }

  // A shop buying parts per repair job (Settings → Repairs): each job's parts cost comes off
  // service profit on the day it was paid. A shop taking parts from stock counted them when
  // it bought them (a Service purchase), so not again.
  if (shown.service && repairFlow.parts === "job") {
    for (const j of await jobsPaidBetween(businessId, from, to, branchIds)) {
      if (j.partsCost <= 0n) continue;
      const r = at(j.paidDate);
      r.expense += j.partsCost; r.expService += j.partsCost;
      expenseCats.set(REPAIR_PARTS_LABEL, (expenseCats.get(REPAIR_PARTS_LABEL) ?? 0n) + j.partsCost);
    }
  }
  // The first day the shop recorded a stock purchase (bought to sell, not repair parts) or a
  // float purchase as expense, over all its records, not only this range: from that day on
  // what it bought is the cost, before it what it sold (see countCosts).
  const NEVER = "9999-12-31";
  const recorded = { businessId, deletedAt: null, status: "COMPLETED", type: "EXPENSE", currency: "MMK", ...branch };
  const [boughtFrom, floatFrom] = await Promise.all([
    prisma.incomeExpense.groupBy({
      by: ["categoryName"],
      where: { ...recorded, OR: [{ purchaseId: { not: null } }, { fromPurchaseId: { not: null } }] },
      _min: { date: true },
    }),
    prisma.incomeExpense.aggregate({ where: { ...recorded, billerTxnId: { not: null } }, _min: { date: true } }),
  ]);
  const purchaseFrom = boughtFrom
    .filter((g) => expenseSection(g.categoryName ?? "") !== "service")
    .reduce((min, g) => (g._min.date && g._min.date < min ? g._min.date : min), NEVER);
  const floatStart = floatFrom._min.date ?? NEVER;

  const finish = (r: PeriodRow) => {
    const totalIncome = r.sales + r.service + r.topup + r.otherIncome;
    // Top-up counts at what is left of its cash once its cost is off: the rest of that cash
    // is the operator's credit passing through.
    const grossProfit = r.sales - r.costOfSales + r.service + (r.topup - r.topupCost) + r.otherIncome;
    const netProfit = grossProfit - r.expense - r.salary;
    return { ...r, totalIncome, grossProfit, netProfit, netCash: r.cashIn - r.cashOut, ...incomeExpenseOf(r) };
  };
  const grouped = new Map<string, PeriodRow>();
  for (const r of [...rows.values()].sort((a, b) => a.period.localeCompare(b.period))) {
    foldHidden(r, shown);
    countCosts(r, r.period >= purchaseFrom, r.period >= floatStart);
    const key = keyOf(r.period);
    grouped.set(key, addRow(grouped.get(key) ?? zeroRow(key), r));
  }
  const ordered = [...grouped.values()].map(finish);
  const sum = ordered.reduce((t, r) => addRow(t, r), zeroRow(`${from} – ${to}`));

  // Items sold, best sellers first.
  const byItem = new Map<string, { name: string; quantity: number; revenue: bigint; cost: bigint }>();
  for (const l of saleLines) {
    const cur = byItem.get(l.item.name) ?? { name: l.item.name, quantity: 0, revenue: 0n, cost: 0n };
    cur.quantity += l.quantity; cur.revenue += l.lineTotal; cur.cost += l.unitCost * BigInt(l.quantity);
    byItem.set(l.item.name, cur);
  }

  // Wallet balances: closing is today's balance less everything after the period; opening
  // is closing less the period's own movements.
  const after = await prisma.walletLedgerEntry.groupBy({
    by: ["walletId", "direction"],
    where: { businessId, createdAt: { gte: range.lt }, walletId: { in: wallets.map((w) => w.id) } },
    _sum: { amount: true },
  });
  const net = (list: { walletId: string; direction: string; amount: bigint }[], id: string) =>
    list.filter((x) => x.walletId === id).reduce((a, x) => a + (x.direction === "DEBIT" ? x.amount : -x.amount), 0n);
  const afterFlat = after.map((a) => ({ walletId: a.walletId, direction: a.direction, amount: a._sum.amount ?? 0n }));

  const totals = finish(sum);
  const stockByBrand = settings.stockColumns === "auto" ? phoneShop : settings.stockColumns === "brand";
  return {
    from, to, groupBy, settings, shown, phoneShop, stockByBrand,
    sections: sectionsOf(sum),
    distribution: distribute(totals.netProfit, settings, periodKeys(from, to, "month").length),
    rows: ordered,
    totals: { ...totals, saleCount: sales.length },
    otherIncomeBy: Object.fromEntries([...otherBy].map(([period, m]) => [period, [...m].map(([label, amount]) => ({ label, amount }))])),
    serviceBy: Object.fromEntries([...serviceBy].map(([period, list]) => [period, [...list].sort((a, b) => a.date.localeCompare(b.date))])),
    incomeByCategory: [...incomeCats].map(([name, amount]) => ({ name, amount })).sort((a, b) => Number(b.amount - a.amount)),
    expenseByCategory: [...expenseCats].map(([name, amount]) => ({ name, amount, salary: salarySet.has(name.toLowerCase()) })).sort((a, b) => Number(b.amount - a.amount)),
    salesByItem: [...byItem.values()].map((i) => ({ ...i, profit: i.revenue - i.cost })).sort((a, b) => Number(b.revenue - a.revenue)),
    repairs: { received: jobsIn, finished: jobsDone, delivered: jobsDelivered, cancelled: jobsCancelled, collected: sum.service },
    wallets: wallets.map((w) => {
      const closing = w.currentBalance - net(afterFlat, w.id);
      const inRange = ledger.filter((l) => l.walletId === w.id);
      const moneyIn = inRange.filter((l) => l.direction === "DEBIT").reduce((a, l) => a + l.amount, 0n);
      const moneyOut = inRange.filter((l) => l.direction === "CREDIT").reduce((a, l) => a + l.amount, 0n);
      return { name: w.name, currency: w.currency, opening: closing - moneyIn + moneyOut, moneyIn, moneyOut, closing };
    }),
    purchases: { count: purchases._count, total: purchases._sum.total ?? 0n },
    stock: await stockOf(businessId, settings.stockCategoryIds, stockByBrand, branchIds),
  };
}

/** Phone brands for the Stock sheet's columns, in the shop's order. Sister brands sit
 *  together (Xiaomi and POCO with Redmi, Realme with Oppo). */
export const STOCK_BRANDS: { name: string; match: RegExp }[] = [
  { name: "Redmi", match: /redmi|xiaomi|poco/i },
  { name: "Oppo", match: /oppo|realme|oneplus/i },
  { name: "Vivo", match: /vivo|(^|[\s/])[yv]\d/i },
  { name: "Infinix", match: /infinix/i },
  { name: "Tecno", match: /tecno|itel|spark|camon|pova/i },
  { name: "Samsung", match: /samsung|galaxy/i },
  { name: "Huawei", match: /huawei|honor|nova/i },
  { name: "iPhone", match: /i\s?phone|apple/i },
];

/** The brand named first in an item's name, or "Other". */
export function brandOf(name: string): string {
  let best = "Other";
  let at = Infinity;
  for (const b of STOCK_BRANDS) {
    const m = b.match.exec(name);
    if (m && m.index < at) { at = m.index; best = b.name; }
  }
  return best;
}

/** Items in the chosen categories (and their sub-categories) with the stock on hand now. */
async function stockOf(businessId: string, categoryIds: string[], byBrand: boolean, branchIds?: string[]) {
  if (!categoryIds.length) return [];
  const children = await prisma.itemCategory.findMany({ where: { businessId, parentId: { in: categoryIds } }, select: { id: true } });
  const items = await prisma.item.findMany({
    where: { businessId, deletedAt: null, active: true, categoryId: { in: [...categoryIds, ...children.map((c) => c.id)] } },
    select: { name: true, costPrice: true, category: { select: { name: true, parentId: true } }, stockLevels: { where: branchIds ? { branchId: { in: branchIds } } : {}, select: { quantity: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });
  return items.map((i) => {
    const quantity = i.stockLevels.reduce((a, l) => a + l.quantity, 0);
    // By brand: a sub-category named after a brand (Spare Parts › Redmi) is that brand, else the
    // brand is read from the name (a sub-category such as LCD is a kind of part, not a brand).
    // By category: the item's sub-category (or category).
    const sub = i.category?.parentId ? i.category.name : null;
    const named = sub ? STOCK_BRANDS.find((b) => b.name.toLowerCase() === sub.trim().toLowerCase())?.name : undefined;
    const group = !byBrand ? i.category?.name ?? "Other" : named ?? brandOf(i.name);
    return { name: i.name, category: i.category?.name ?? "", group, quantity, cost: i.costPrice, value: i.costPrice * BigInt(quantity) };
  });
}

import { addDays, isValidBusinessDate, isValidMonth, todayBusinessDate } from "./dates";
import { ApiError } from "./api";
import { STOCK_BRANDS, type Report } from "@/services/reportService";
import type { Cell, Sheet } from "./xlsx";

/** Shared by the Excel download and the Google Sheet sync, so both carry the same
 *  three sheets: the Grand Report (income, expense, profit, salary, capital and each
 *  partner's share), the daily (or monthly) summary, and the stock of the chosen
 *  categories. Nothing else, so the sheets stay easy to read. */

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
  const d = r.distribution;
  const s = r.settings;
  const grand: Cell[][] = [[title, "MMK"], ["Period", `${r.from} – ${r.to}`]];
  const bold: number[] = [];
  const blank = () => grand.push([]);
  const strong = (label: string, v: bigint | null) => { bold.push(grand.length); grand.push([label, v === null ? "" : n(v)]); };

  const sh = r.shown;
  // Columns for the parts this shop runs; Other is always there.
  const parts = [
    ...(sh.sales ? [["sales", "Sales", "အရောင်း"]] : []),
    ...(sh.service ? [["service", "Service", "ဆားဗစ်"]] : []),
    ...(sh.topup ? [["topup", "Top-up", "ဖုန်းဖြည့်"]] : []),
  ] as ["sales" | "service" | "topup", string, string][];
  blank(); strong("INCOME (ဝင်ငွေ)", null);
  grand.push(...parts.map(([k, en, mm]) => [`${en} (${mm})`, n(t.inc[k])]), ["Other income (အခြား)", n(t.inc.other)]);
  strong("Total income", t.inc.total);
  blank(); strong("EXPENSE (ထွက်ငွေ)", null);
  grand.push(...parts.map(([k, en, mm]) => [`${en} (${mm})`, n(t.exp[k])]), ["Other expense (အခြား)", n(t.exp.other)]);
  strong("Total expense", t.exp.total);
  blank();
  strong("PROFIT (အမြတ်) = Income − Expense", t.net);
  grand.push(["− Staff salary (ဝန်ထမ်းလစာ)", -n(t.salary)]);
  strong("NET PROFIT (အသားတင်အမြတ်)", t.netProfit);
  grand.push([`− Capital for next month (နောက်လအရင်း) ${s.reserve.mode === "percent" ? `${s.reserve.value}%` : `${s.reserve.value.toLocaleString("en-US")} × ${d.months}`}`, -n(d.reserve)]);
  strong("TO SHARE (ခွဲဝေရန်)", d.distributable);
  for (const p of d.partners) grand.push([`   ${p.name} (${p.percent}%)`, n(p.amount)]);

  const width = parts.length + 2;
  const head1: Cell[] = ["", "Income", ...Array(width - 1).fill(""), "Expense", ...Array(width - 1).fill(""), ""];
  const head2: Cell[] = [r.groupBy === "day" ? "Date" : "Month",
    ...parts.map(([, en]) => en), "Other income", "Total income",
    ...parts.map(([, en]) => en), "Other Expense", "Total Expense", "Net Profit / Loss"];
  const line = (x: Report["rows"][number], label: string): Cell[] => [
    label, ...parts.map(([k]) => n(x.inc[k])), n(x.inc.other), n(x.inc.total),
    ...parts.map(([k]) => n(x.exp[k])), n(x.exp.other), n(x.exp.total), n(x.net),
  ];
  const daily = [head1, head2, ...r.rows.map((x) => line(x, x.period)), line(t, "TOTAL")];

  const sheets: Sheet[] = [
    { name: "Grand Report", rows: grand, boldRows: bold },
    { name: r.groupBy === "day" ? "Daily summary" : "Monthly summary", rows: daily, boldRows: [1, daily.length - 1] },
  ];
  if (s.stockCategoryIds.length) sheets.push(stockSheet(r.stock));
  return sheets;
}

/** Stock laid out the way the shop keeps it: each brand side by side as a Name / QTY pair,
 *  and on the right a summary per brand (items, units, and items at zero). */
function stockSheet(stock: Report["stock"]): Sheet {
  const order = [...STOCK_BRANDS.map((b) => b.name)];
  const groups = new Map<string, Report["stock"]>();
  for (const i of stock) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
  const names = [...groups.keys()].sort((a, b) => {
    const ia = a === "Other" ? 999 : order.indexOf(a) < 0 ? 500 : order.indexOf(a);
    const ib = b === "Other" ? 999 : order.indexOf(b) < 0 ? 500 : order.indexOf(b);
    return ia - ib || a.localeCompare(b);
  });
  const label = (g: string) => (g === "Other" ? "အခြား ပစ္စည်းများ" : g);
  const height = Math.max(0, ...names.map((g) => groups.get(g)!.length));
  const summaryCol = names.length * 2 + 1;
  const rows: Cell[][] = [[...names.flatMap((g) => [label(g), "QTY"]), "", "Brand / Category", "Items", "Units", "Zero Qty"]];
  for (let r = 0; r < height; r++) {
    const row: Cell[] = [];
    for (const g of names) {
      const item = groups.get(g)![r];
      row.push(item ? item.name : "", item ? item.quantity : "");
    }
    rows.push(row);
  }
  // Summary block beside the columns, one brand per row, then the total.
  const summary: Cell[][] = names.map((g) => {
    const list = groups.get(g)!;
    return [label(g), list.length, list.reduce((a, i) => a + i.quantity, 0), list.filter((i) => i.quantity <= 0).length];
  });
  summary.push(["TOTAL", stock.length, stock.reduce((a, i) => a + i.quantity, 0), stock.filter((i) => i.quantity <= 0).length]);
  summary.forEach((line, k) => {
    const row = rows[k + 1] ?? (rows[k + 1] = []);
    while (row.length < summaryCol) row.push("");
    row.push(...line);
  });
  return { name: "Stock", rows, boldRows: [summary.length] };
}

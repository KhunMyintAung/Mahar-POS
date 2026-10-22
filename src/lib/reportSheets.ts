import { addDays, isValidBusinessDate, isValidMonth, todayBusinessDate } from "./dates";
import { ApiError } from "./api";
import type { Report } from "@/services/reportService";
import type { Cell, Sheet } from "./xlsx";

/** Shared by the Excel download and the Google Sheet backup, so both carry the same
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

  blank(); strong("INCOME (ဝင်ငွေ)", null);
  grand.push(["Sales (အရောင်း)", n(t.inc.sales)], ["Service (ဆားဗစ်)", n(t.inc.service)], ["Top-up (ဖုန်းဖြည့်)", n(t.inc.topup)], ["Other income (အခြား)", n(t.inc.other)]);
  strong("Total income", t.inc.total);
  blank(); strong("EXPENSE (ထွက်ငွေ)", null);
  grand.push(["Sales (အရောင်း)", n(t.exp.sales)], ["Service (ဆားဗစ်)", n(t.exp.service)], ["Top-up (ဖုန်းဖြည့်)", n(t.exp.topup)], ["Other expense (အခြား)", n(t.exp.other)]);
  strong("Total expense", t.exp.total);
  blank();
  strong("PROFIT (အမြတ်) = Income − Expense", t.net);
  grand.push(["− Staff salary (ဝန်ထမ်းလစာ)", -n(t.salary)]);
  strong("NET PROFIT (အသားတင်အမြတ်)", t.netProfit);
  grand.push([`− Capital for next month (နောက်လအရင်း) ${s.reserve.mode === "percent" ? `${s.reserve.value}%` : `${s.reserve.value.toLocaleString("en-US")} × ${d.months}`}`, -n(d.reserve)]);
  strong("TO SHARE (ခွဲဝေရန်)", d.distributable);
  for (const p of d.partners) grand.push([`   ${p.name} (${p.percent}%)`, n(p.amount)]);

  const head1: Cell[] = ["", "Income", "", "", "", "", "Expense", "", "", "", "", ""];
  const head2: Cell[] = [r.groupBy === "day" ? "Date" : "Month", "Sales", "Service", "Top-up", "Other income", "Total income", "Sales", "Service", "Top-up", "Other Expense", "Total Expense", "Net Profit / Loss"];
  const line = (x: Report["rows"][number], label: string): Cell[] => [
    label, n(x.inc.sales), n(x.inc.service), n(x.inc.topup), n(x.inc.other), n(x.inc.total),
    n(x.exp.sales), n(x.exp.service), n(x.exp.topup), n(x.exp.other), n(x.exp.total), n(x.net),
  ];
  const daily = [head1, head2, ...r.rows.map((x) => line(x, x.period)), line(t, "TOTAL")];

  const sheets: Sheet[] = [
    { name: "Grand Report", rows: grand, boldRows: bold },
    { name: r.groupBy === "day" ? "Daily summary" : "Monthly summary", rows: daily, boldRows: [1, daily.length - 1] },
  ];
  if (s.stockCategoryIds.length) {
    const total = r.stock.reduce((a, i) => a + i.value, 0n);
    const stock: Cell[][] = [["Item", "Category", "Qty", "Cost", "Stock value"], ...r.stock.map((i) => [i.name, i.category, i.quantity, n(i.cost), n(i.value)]), ["TOTAL", "", r.stock.reduce((a, i) => a + i.quantity, 0), "", n(total)]];
    sheets.push({ name: "Stock", rows: stock, boldRows: [stock.length - 1] });
  }
  return sheets;
}

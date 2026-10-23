import { addDays, isValidBusinessDate, isValidMonth, todayBusinessDate } from "./dates";
import { ApiError } from "./api";
import { STOCK_BRANDS, type Report } from "@/services/reportService";
import type { Cell, Sheet } from "./xlsx";

/** Shared by the Excel download and the Google Sheet sync, so both carry the same sheets:
 *  the daily (or monthly) summary, and the stock of the chosen categories. Nothing else,
 *  so the sheets stay easy to read. */

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

export function reportSheets(r: Report): Sheet[] {
  const t = r.totals;
  const sh = r.shown;
  // Columns for the parts this shop runs; Other is always there.
  const parts = [
    ...(sh.sales ? [["sales", "Sales"]] : []),
    ...(sh.service ? [["service", "Service"]] : []),
    ...(sh.topup ? [["topup", "Top-up"]] : []),
  ] as ["sales" | "service" | "topup", string][];

  const width = parts.length + 2;
  const head1: Cell[] = ["", "Income", ...Array(width - 1).fill(""), "Expense", ...Array(width - 1).fill(""), ""];
  const head2: Cell[] = [r.groupBy === "day" ? "Date" : "Month",
    ...parts.map(([, en]) => en), "Other income", "Total income",
    ...parts.map(([, en]) => en), "Other Expense", "Total Expense", "Net Profit / Loss"];
  const line = (x: Report["rows"][number], label: string): Cell[] => [
    label, ...parts.map(([k]) => n(x.inc[k])), n(x.inc.other), n(x.inc.total),
    ...parts.map(([k]) => n(x.exp[k])), n(x.exp.other), n(x.exp.total), n(x.net),
  ];
  // Laid out the same on every sync (the sync only rewrites values, so a shift would put the
  // owner's own formatting on the wrong rows): two heading rows, a line per day / month.
  const daily = [head1, head2, ...r.rows.map((x) => line(x, x.period)), line(t, "TOTAL")];

  const sheets: Sheet[] = [
    { name: r.groupBy === "day" ? "Daily summary" : "Monthly summary", rows: daily, boldRows: [1, daily.length - 1] },
  ];
  if (r.settings.stockCategoryIds.length) sheets.push(stockSheet(r.stock));
  return sheets;
}

/** Stock laid out the way the shop keeps it: each brand side by side as a Name / QTY pair,
 *  and on the right a summary per brand (items, units, and items at zero). */
function stockSheet(stock: Report["stock"]): Sheet {
  // Every brand always has its pair of columns, in the same order, even with no items yet:
  // the sync rewrites values only, so columns that came and went would move the owner's
  // formatting onto the wrong brand.
  const names = [...STOCK_BRANDS.map((b) => b.name), "Other"];
  const groups = new Map<string, Report["stock"]>(names.map((g) => [g, []]));
  for (const i of stock) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
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

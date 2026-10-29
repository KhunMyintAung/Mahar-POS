"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Settings2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

/** Reports: the daily (or monthly) summary of income and expense. The Grand Report (profit,
 *  salary, capital for next month, each partner's share) goes out in CSV, the Google Sheet
 *  sync and the Telegram daily report, with a Stock sheet of the categories picked in Report
 *  settings; neither is shown on this page. */

type Kind = "day" | "month" | "year" | "range";
type Money = string;
type Sec = "sales" | "service" | "topup" | "general";
interface Cols { sales: Money; service: Money; topup: Money; other: Money; total: Money }
interface Row { period: string; inc: Cols; exp: Cols; net: Money; salary: Money; netProfit: Money }
interface Settings {
  salaryCategories: string[]; showShares: boolean; generalExpenseTo: Sec;
  reserve: { mode: "percent" | "amount"; value: number }; partners: { name: string; percent: number }[];
  stockCategoryIds: string[];
}
interface Report {
  from: string; to: string; groupBy: "day" | "month";
  period: { kind: Kind; label: string };
  settings: Settings;
  /** The parts this shop runs; the others have no column. */
  shown: { sales: boolean; service: boolean; topup: boolean };
  rows: Row[];
  totals: Row;
  distribution: { reserve: Money; distributable: Money; months: number; partners: { name: string; percent: number; amount: Money }[] };
  stock: { name: string; category: string; quantity: number; cost: Money; value: Money }[];
}

const big = (m: Money) => BigInt(m);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
const tone = (m: Money) => (big(m) < 0n ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400");
const field = "min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm";

function shift(kind: Kind, value: string, by: number): string {
  if (kind === "year") return String(Number(value) + by);
  if (kind === "month") {
    const [y, m] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
  }
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}


export default function ReportsPage() {
  const { hasPerm } = useAuth();
  const owner = hasPerm("settings.manage");
  const { push } = useToast();
  const [kind, setKind] = useState<Kind>("month");
  const [value, setValue] = useState(() => today().slice(0, 7));
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  // The report and the query it answers, so a newer pick shows as loading.
  const [loaded, setLoaded] = useState<{ query: string; report: Report } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ period: kind });
    if (kind === "range") { p.set("from", from); p.set("to", to); } else p.set("date", value);
    return p.toString();
  }, [kind, value, from, to]);

  const load = useCallback(() => {
    api<Report>(`/api/v1/reports/full?${query}`)
      .then((report) => setLoaded({ query, report }))
      .catch((e) => push(e.message, "error"));
  }, [query, push]);
  useEffect(load, [load]);
  const report = loaded?.report ?? null;
  const loading = loaded?.query !== query;

  function pick(k: Kind) {
    const t = today();
    setKind(k);
    if (k === "day") setValue(t);
    if (k === "month") setValue(t.slice(0, 7));
    if (k === "year") setValue(t.slice(0, 4));
  }

  const years = Array.from({ length: 6 }, (_, i) => String(Number(today().slice(0, 4)) - i));
  const t = report?.totals;
  const d = report?.distribution;
  const s = report?.settings;
  const parts = ([["sales", "Sales"], ["service", "Service"], ["topup", "Top-up"]] as const).filter(([k]) => report?.shown?.[k] ?? true);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader
        title={<>Reports</>}
        lead={
          <>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
            {([["day", "Day"], ["month", "Month"], ["year", "Year"], ["range", "Custom"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => pick(k)}
                className={cn("min-h-9 rounded-md px-3 text-sm font-medium", kind === k ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")}>
                {label}
              </button>
            ))}
          </div>
          {kind !== "range" ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" aria-label="Previous" onClick={() => setValue(shift(kind, value, -1))}>‹</Button>
              {kind === "day" && <input type="date" value={value} onChange={(e) => e.target.value && setValue(e.target.value)} className={field} />}
              {kind === "month" && <input type="month" value={value} onChange={(e) => e.target.value && setValue(e.target.value)} className={field} />}
              {kind === "year" && (
                <select value={value} onChange={(e) => setValue(e.target.value)} className={field}>
                  {(years.includes(value) ? years : [value, ...years]).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              <Button variant="ghost" aria-label="Next" onClick={() => setValue(shift(kind, value, 1))}>›</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
          {loading && <span className="text-xs text-gray-400">Loading…</span>}
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {hasPerm("report.export") && (
            <a href={`/api/v1/reports/csv?${query}`} className="inline-flex min-h-10 items-center rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700">
              <FileSpreadsheet size={16} className="mr-1.5" />CSV
            </a>
          )}
          {owner && <Button variant="secondary" aria-label="Report settings" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></Button>}
        </div>
      </PageHeader>

      {!report || !t || !d || !s ? <Spinner /> : (
        <>

          <Card>
            <h3 className="mb-3 text-sm font-semibold">{report.groupBy === "day" ? "Daily summary" : "Monthly summary"}</h3>
            <div className="max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              {/* Fits the page on a computer: small type, headings that wrap, tight cells. */}
              <table className="w-full min-w-max text-xs lg:min-w-0">
                <thead className="bg-gray-50 text-[11px] text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                  <tr>
                    <th />
                    <th colSpan={parts.length + 2} className="border-l border-gray-200 px-1.5 pt-1.5 text-center font-semibold uppercase tracking-wide text-green-700 dark:border-gray-700 dark:text-green-400">Income</th>
                    <th colSpan={parts.length + 2} className="border-l border-gray-200 px-1.5 pt-1.5 text-center font-semibold uppercase tracking-wide text-red-700 dark:border-gray-700 dark:text-red-400">Expense</th>
                    <th className="border-l border-gray-200 dark:border-gray-700" />
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    {[report.groupBy === "day" ? "Date" : "Month", ...parts.map(([, l]) => l), "Other income", "Total income", ...parts.map(([, l]) => l), "Other Expense", "Total Expense", "Net Profit / Loss"].map((h, i, all) => (
                      <th key={i} className={cn("px-1.5 py-1.5 align-bottom font-medium leading-tight", i > 0 && "text-right", (i === 1 || i === parts.length + 3 || i === all.length - 1) && "border-l border-gray-200 dark:border-gray-700")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                  {[...report.rows, { ...t, period: "Total" }].map((r) => {
                    const total = r.period === "Total";
                    const empty = !total && big(r.inc.total) === 0n && big(r.exp.total) === 0n;
                    const cells = [...parts.map(([k]) => r.inc[k]), r.inc.other, r.inc.total, ...parts.map(([k]) => r.exp[k]), r.exp.other, r.exp.total];
                    const half = parts.length + 2;
                    return (
                      <tr key={r.period} className={cn(total && "bg-gray-50 font-semibold dark:bg-gray-800/60", empty && "text-gray-400")}>
                        <td className="whitespace-nowrap px-1.5 py-1.5">{report.groupBy === "day" && !total ? r.period.slice(5) : r.period}</td>
                        {cells.map((v, i) => (
                          <td key={i} className={cn("px-1.5 py-1.5 text-right tabular-nums", (i === 0 || i === half) && "border-l border-gray-100 dark:border-gray-800", (i === half - 1 || i === 2 * half - 1) && "font-semibold")}>{fmtMoney(v)}</td>
                        ))}
                        <td className={cn("border-l border-gray-100 px-1.5 py-1.5 text-right font-semibold tabular-nums dark:border-gray-800", !empty && tone(r.net))}>{fmtMoney(r.net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {owner && (
            <Link href="/settings#sheets" className="no-print flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm hover:border-green-400 dark:border-gray-800 dark:bg-gray-900">
              <span className="flex items-center gap-2"><FileSpreadsheet size={18} className="text-green-600" />Google Sheet sync</span>
              <span className="text-blue-600">Settings →</span>
            </Link>
          )}
        </>
      )}

      {owner && <ReportSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} shown={report?.shown ?? { sales: true, service: true, topup: true }} />}
    </div>
  );
}

/** Where general expenses go, and the stock categories. Owner only. */
function ReportSettingsModal({ open, onClose, onSaved, shown }: { open: boolean; onClose: () => void; onSaved: () => void; shown: Report["shown"] }) {
  const { push } = useToast();
  const [itemCats, setItemCats] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [cfg, setCfg] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api<{ categories: { id: string; name: string; parentId: string | null }[] }>("/api/v1/item-meta"),
      api<Settings>("/api/v1/reports/settings"),
    ]).then(([meta, c]) => {
      setItemCats(meta.categories);
      setCfg(c);
    }).catch((e) => push(e.message, "error"));
  }, [open, push]);

  async function save() {
    if (!cfg) return;
    setBusy(true);
    try {
      await api("/api/v1/reports/settings", {
        method: "PUT",
        body: cfg,
      });
      push("Report settings saved");
      onSaved();
      onClose();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: string[], x: string, on: boolean) => (on ? [...list, x] : list.filter((y) => y !== x));
  const topCats = itemCats.filter((c) => !c.parentId);

  return (
    <Modal open={open} onClose={onClose} title="Report settings">
      {!cfg ? <Spinner /> : (
        <div className="space-y-5">
          <section>
            <div className="mb-1 text-sm font-semibold">1. General expenses go under</div>
            <p className="mb-2 text-xs text-gray-500">Daily General Expense and your own expense categories (rent, electricity…).</p>
            <select value={cfg.generalExpenseTo} onChange={(e) => setCfg({ ...cfg, generalExpenseTo: e.target.value as Sec })} className={cn(field, "w-full")}>
              {shown.service && <option value="service">Service</option>}
              {shown.sales && <option value="sales">Sales</option>}
              {shown.topup && <option value="topup">Top-up</option>}
              <option value="general">Other Expense</option>
            </select>
          </section>

          <section>
            <div className="mb-1 text-sm font-semibold">2. Stock sheet</div>
            <p className="mb-2 text-xs text-gray-500">Only in CSV and Google Sheet, not on this page. Only the item categories ticked here are listed (for example Spare Parts); sub-categories come with them.</p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              {topCats.length === 0 && <p className="text-xs text-gray-400">No item categories yet</p>}
              {topCats.map((c) => (
                <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.stockCategoryIds.includes(c.id)} onChange={(e) => setCfg({ ...cfg, stockCategoryIds: toggle(cfg.stockCategoryIds, c.id, e.target.checked) })} />
                  {c.name}
                </label>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={busy} onClick={save}>Save</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

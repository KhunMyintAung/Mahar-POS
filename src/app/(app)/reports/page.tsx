"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer, Settings2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { GsheetBackupCard } from "@/components/GsheetBackupCard";

/** Reports: the Grand Report (income, expense, profit, salary, capital and each partner's
 *  share) and the daily (or monthly) summary. The Excel file and the Google Sheet backup
 *  carry these two plus a Stock sheet of the categories picked in Report settings; stock
 *  is not shown on this page. */

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

function Line({ label, value, strong, minus, big: large }: { label: string; value: Money; strong?: boolean; minus?: boolean; big?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t border-gray-200 pt-2 font-semibold dark:border-gray-700")}>
      <span className={cn("text-sm", !strong && "text-gray-600 dark:text-gray-300")}>{minus && <span className="mr-1 text-gray-400">−</span>}{label}</span>
      <span className={cn("tabular-nums", large ? "text-lg" : "text-sm", strong && tone(value))}>{fmtMoney(value)}</span>
    </div>
  );
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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Reports</h1>
        <div className="flex flex-wrap gap-2">
          {hasPerm("report.export") && (
            <a href={`/api/v1/reports/xlsx?${query}`} className="inline-flex min-h-10 items-center rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700">
              <FileSpreadsheet size={16} className="mr-1.5" />Excel
            </a>
          )}
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} className="mr-1 inline" />Print</Button>
          {owner && <Button variant="secondary" aria-label="Report settings" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></Button>}
        </div>
      </div>

      <Card className="no-print">
        <div className="flex flex-wrap items-end gap-3">
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
        </div>
      </Card>

      {!report || !t || !d || !s ? <Spinner /> : (
        <>
          <Card>
            <h2 className="text-base font-bold">Grand Report</h2>
            <p className="mb-3 text-xs text-gray-500">{report.from} – {report.to}</p>
            <div className="grid gap-x-8 gap-y-2 md:grid-cols-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Income</div>
                <Line label="Sales" value={t.inc.sales} />
                <Line label="Service" value={t.inc.service} />
                <Line label="Top-up" value={t.inc.topup} />
                <Line label="Other income" value={t.inc.other} />
                <Line label="Total income" value={t.inc.total} strong />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Expense</div>
                <Line label="Sales" value={t.exp.sales} />
                <Line label="Service" value={t.exp.service} />
                <Line label="Top-up" value={t.exp.topup} />
                <Line label="Other Expense" value={t.exp.other} />
                <Line label="Total Expense" value={t.exp.total} strong />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Profit</div>
                <Line label="Profit (Income − Expense)" value={t.net} strong big />
                <Line label="Staff salary" value={t.salary} minus />
                <Line label="Net profit" value={t.netProfit} strong big />
                <Line label="Capital for next month" value={d.reserve} minus />
                <Line label="To share" value={d.distributable} strong big />
                {d.partners.map((p) => (
                  <div key={p.name} className="flex items-baseline justify-between gap-3 py-1 pl-3 text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{p.name} <span className="text-xs text-gray-400">{p.percent}%</span></span>
                    <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">{fmtMoney(p.amount)}</span>
                  </div>
                ))}
                {d.partners.length === 0 && owner && <p className="pt-1 text-xs text-gray-400">Add partners in Report settings (⚙) to see each one&apos;s share.</p>}
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold">{report.groupBy === "day" ? "Daily summary" : "Monthly summary"}</h3>
            <div className="max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                  <tr>
                    <th />
                    <th colSpan={5} className="border-l border-gray-200 px-3 pt-2 text-center text-green-700 dark:border-gray-700 dark:text-green-400">Income</th>
                    <th colSpan={5} className="border-l border-gray-200 px-3 pt-2 text-center text-red-700 dark:border-gray-700 dark:text-red-400">Expense</th>
                    <th className="border-l border-gray-200 dark:border-gray-700" />
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    {[report.groupBy === "day" ? "Date" : "Month", "Sales", "Service", "Top-up", "Other income", "Total income", "Sales", "Service", "Top-up", "Other Expense", "Total Expense", "Net Profit / Loss"].map((h, i) => (
                      <th key={i} className={cn("px-3 py-2 font-medium", i > 0 && "text-right", (i === 1 || i === 6 || i === 11) && "border-l border-gray-200 dark:border-gray-700")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                  {[...report.rows, { ...t, period: "Total" }].map((r) => {
                    const total = r.period === "Total";
                    const empty = !total && big(r.inc.total) === 0n && big(r.exp.total) === 0n;
                    const cells = [r.inc.sales, r.inc.service, r.inc.topup, r.inc.other, r.inc.total, r.exp.sales, r.exp.service, r.exp.topup, r.exp.other, r.exp.total];
                    return (
                      <tr key={r.period} className={cn(total && "bg-gray-50 font-semibold dark:bg-gray-800/60", empty && "text-gray-400")}>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{r.period}</td>
                        {cells.map((v, i) => (
                          <td key={i} className={cn("px-3 py-2 text-right tabular-nums", (i === 0 || i === 5) && "border-l border-gray-100 dark:border-gray-800", (i === 4 || i === 9) && "font-semibold")}>{fmtMoney(v)}</td>
                        ))}
                        <td className={cn("border-l border-gray-100 px-3 py-2 text-right font-semibold tabular-nums dark:border-gray-800", !empty && tone(r.net))}>{fmtMoney(r.net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {owner && <div className="no-print"><GsheetBackupCard period={kind} date={value} from={from} to={to} label={report.period.label} /></div>}
        </>
      )}

      {owner && <ReportSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} />}
    </div>
  );
}

/** Staff salary categories, where general expenses go, capital for next month, partners
 *  and the stock categories. Owner only. */
function ReportSettingsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const [cats, setCats] = useState<string[]>([]);
  const [itemCats, setItemCats] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [cfg, setCfg] = useState<Settings | null>(null);
  const [reserveValue, setReserveValue] = useState("0");
  const [partners, setPartners] = useState<{ name: string; percent: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api<{ name: string }[]>("/api/v1/categories?type=EXPENSE"),
      api<{ categories: { id: string; name: string; parentId: string | null }[] }>("/api/v1/item-meta"),
      api<Settings>("/api/v1/reports/settings"),
    ]).then(([list, meta, c]) => {
      setCats(list.map((x) => x.name));
      setItemCats(meta.categories);
      setCfg(c);
      setReserveValue(String(c.reserve.value));
      setPartners(c.partners.map((p) => ({ name: p.name, percent: p.percent ? String(p.percent) : "" })));
    }).catch((e) => push(e.message, "error"));
  }, [open, push]);

  async function addSalaryCategory() {
    setBusy(true);
    try {
      const name = "Staff Salary";
      await api("/api/v1/categories", { method: "POST", body: { type: "EXPENSE", name } });
      setCats((c) => [...c, name]);
      setCfg((c) => (c ? { ...c, salaryCategories: [...c.salaryCategories, name] } : c));
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!cfg) return;
    setBusy(true);
    try {
      await api("/api/v1/reports/settings", {
        method: "PUT",
        body: {
          ...cfg,
          reserve: { mode: cfg.reserve.mode, value: Number(reserveValue.replace(/,/g, "")) || 0 },
          partners: partners.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), percent: Number(p.percent) || 0 })),
        },
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
            <div className="mb-1 text-sm font-semibold">1. Staff salary</div>
            <p className="mb-2 text-xs text-gray-500">Tick the expense categories that are staff pay. They come off after profit.</p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              {cats.map((c) => (
                <label key={c} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.salaryCategories.includes(c)} onChange={(e) => setCfg({ ...cfg, salaryCategories: toggle(cfg.salaryCategories, c, e.target.checked) })} />
                  {c}
                </label>
              ))}
            </div>
            {!cats.some((c) => /salary|လစာ/i.test(c)) && (
              <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={addSalaryCategory}>+ Add a &quot;Staff Salary&quot; category</Button>
            )}
          </section>

          <section>
            <div className="mb-1 text-sm font-semibold">2. General expenses go under</div>
            <p className="mb-2 text-xs text-gray-500">Daily General Expense and your own expense categories (rent, electricity…).</p>
            <select value={cfg.generalExpenseTo} onChange={(e) => setCfg({ ...cfg, generalExpenseTo: e.target.value as Sec })} className={cn(field, "w-full")}>
              <option value="service">Service</option>
              <option value="sales">Sales</option>
              <option value="topup">Top-up</option>
              <option value="general">Other Expense</option>
            </select>
          </section>

          <section>
            <div className="mb-1 text-sm font-semibold">3. Capital for next month</div>
            <p className="mb-2 text-xs text-gray-500">Kept from net profit before the partners share the rest.</p>
            <div className="flex gap-2">
              <select value={cfg.reserve.mode} onChange={(e) => setCfg({ ...cfg, reserve: { ...cfg.reserve, mode: e.target.value as "percent" | "amount" } })} className={field}>
                <option value="percent">% of net profit</option>
                <option value="amount">MMK each month</option>
              </select>
              <input inputMode="decimal" value={reserveValue} onChange={(e) => setReserveValue(e.target.value)} className={cn(field, "min-w-0 flex-1 text-right")} />
            </div>
          </section>

          <section>
            <div className="mb-1 text-sm font-semibold">4. Partners</div>
            <p className="mb-2 text-xs text-gray-500">Leave % empty to share equally (3 partners = a third each), or give each a % adding up to 100.</p>
            <div className="space-y-2">
              {partners.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input placeholder="Name" value={p.name} onChange={(e) => setPartners((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={cn(field, "min-w-0 flex-1")} />
                  <input placeholder="%" inputMode="decimal" value={p.percent} onChange={(e) => setPartners((l) => l.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} className={cn(field, "w-20 text-right")} />
                  <Button variant="ghost" aria-label="Remove partner" onClick={() => setPartners((l) => l.filter((_, j) => j !== i))}>✕</Button>
                </div>
              ))}
            </div>
            {partners.length < 10 && (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPartners((l) => [...l, { name: `Boss ${l.length + 1}`, percent: "" }])}>+ Add partner</Button>
            )}
          </section>

          <section>
            <div className="mb-1 text-sm font-semibold">5. Stock sheet</div>
            <p className="mb-2 text-xs text-gray-500">Only in Excel and Google Sheet, not on this page. Only the item categories ticked here are listed (for example Spare Parts); sub-categories come with them.</p>
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

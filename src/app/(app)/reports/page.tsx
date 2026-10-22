"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer, Settings2 } from "lucide-react";
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, StatCard, Table, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { GsheetBackupCard } from "@/components/GsheetBackupCard";

type Kind = "day" | "month" | "year" | "range";
type Money = string;
interface Row {
  period: string; sales: Money; salesCost: Money; service: Money; topup: Money; topupMargin: Money; otherIncome: Money;
  expense: Money; salary: Money; repairParts: Money; shares: Money; cashIn: Money; cashOut: Money;
  totalIncome: Money; grossProfit: Money; netProfit: Money; netCash: Money;
}
interface Report {
  from: string; to: string; groupBy: "day" | "month";
  period: { kind: Kind; label: string };
  settings: Settings;
  rows: Row[];
  totals: Row & { saleCount: number };
  incomeByCategory: { name: string; amount: Money }[];
  expenseByCategory: { name: string; amount: Money; salary: boolean }[];
  salesByItem: { name: string; quantity: number; revenue: Money; cost: Money; profit: Money }[];
  repairs: { received: number; finished: number; delivered: number; cancelled: number; collected: Money };
  wallets: { name: string; currency: string; opening: Money; moneyIn: Money; moneyOut: Money; closing: Money }[];
  purchases: { count: number; total: Money };
  sections: { section: Section; income: { label: string; amount: Money }[]; expense: { label: string; amount: Money }[]; profit: Money }[];
  distribution: { netProfit: Money; reserve: Money; distributable: Money; months: number; partners: { name: string; percent: number; amount: Money }[] };
}
type Section = "sales" | "service" | "topup" | "general";
interface Settings {
  salaryCategories: string[]; showShares: boolean; generalExpenseTo: Section;
  reserve: { mode: "percent" | "amount"; value: number }; partners: { name: string; percent: number }[];
}
const SECTION_NAME: Record<Section, string> = { sales: "Sales section", service: "Service section", topup: "Top-up & bill section", general: "General section" };

const big = (m: Money) => BigInt(m);
const num = (m: Money) => Number(BigInt(m)) / 100;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
const tone = (m: Money) => (big(m) < 0n ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400");

function shift(kind: Kind, value: string, by: number): string {
  if (kind === "year") return String(Number(value) + by);
  if (kind === "month") {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return d.toISOString().slice(0, 7);
  }
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/** One line of the profit statement. */
function Line2({ label, value, strong, minus, hint }: { label: string; value: Money; strong?: boolean; minus?: boolean; hint?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t border-gray-200 pt-2 font-semibold dark:border-gray-700")}>
      <span className={cn("text-sm", !strong && "text-gray-600 dark:text-gray-300")}>
        {minus && <span className="mr-1 text-gray-400">−</span>}{label}
        {hint && <span className="ml-1 text-xs text-gray-400">{hint}</span>}
      </span>
      <span className={cn("tabular-nums", strong ? "text-base" : "text-sm", strong && tone(value))}>{fmtMoney(value)}</span>
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
  const [showAllItems, setShowAllItems] = useState(false);
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
  const report = loaded?.report ?? null;
  const loading = loaded?.query !== query;
  useEffect(load, [load]);

  function pick(k: Kind) {
    const t = today();
    setKind(k);
    if (k === "day") setValue(t);
    if (k === "month") setValue(t.slice(0, 7));
    if (k === "year") setValue(t.slice(0, 4));
  }

  const chart = useMemo(() => (report?.rows ?? []).map((r) => ({
    period: report?.groupBy === "day" ? r.period.slice(8) : r.period.slice(5),
    income: num(r.totalIncome),
    expense: num(r.expense) + num(r.salary),
    profit: num(r.netProfit),
  })), [report]);

  const t = report?.totals;
  const s = report?.settings;
  const showSalary = Boolean(s && (s.salaryCategories.length > 0 || (t && big(t.salary) !== 0n)));
  const years = Array.from({ length: 6 }, (_, i) => String(Number(today().slice(0, 4)) - i));

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
              {kind === "day" && <input type="date" value={value} onChange={(e) => e.target.value && setValue(e.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />}
              {kind === "month" && <input type="month" value={value} onChange={(e) => e.target.value && setValue(e.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />}
              {kind === "year" && (
                <select value={value} onChange={(e) => setValue(e.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm">
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

      {!report || !t || !s ? <Spinner /> : (
        <>
          <p className="text-sm text-gray-500">
            {report.period.kind === "year" ? "Year" : report.period.kind === "month" ? "Month" : report.period.kind === "day" ? "Day" : "Range"} report · {report.from} – {report.to}
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total income" value={fmtMoney(t.totalIncome)} sub={`${t.saleCount} sales`} tone="blue" />
            <StatCard label="Gross profit" value={fmtMoney(t.grossProfit)} sub="After cost of goods" tone={big(t.grossProfit) < 0n ? "red" : "green"} />
            <StatCard label="Net profit" value={fmtMoney(t.netProfit)} sub={showSalary ? "After expenses & salary" : "After expenses"} tone={big(t.netProfit) < 0n ? "red" : "green"} />
            <StatCard label="Net cash flow" value={fmtMoney(t.netCash)} sub="Money in − money out" tone={big(t.netCash) < 0n ? "red" : "green"} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            {report.sections.map((x) => (
              <Card key={x.section}>
                <h3 className="mb-1 text-sm font-semibold">{SECTION_NAME[x.section]}</h3>
                {x.income.map((l) => <Line2 key={l.label} label={l.label} value={l.amount} />)}
                {x.expense.map((l) => <Line2 key={l.label} label={l.label} value={l.amount} minus />)}
                <Line2 label="Profit" value={x.profit} strong />
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Profit &amp; split</h3>
              {report.sections.map((x) => (
                <Line2 key={x.section} label={SECTION_NAME[x.section]} value={x.profit} />
              ))}
              <Line2 label="Profit" value={(big(t.netProfit) + big(t.salary)).toString()} strong />
              <Line2 label="Staff salary" value={t.salary} minus />
              <Line2 label="Net profit" value={t.netProfit} strong />
              <Line2 label="Capital kept for next month" value={report.distribution.reserve} minus
                hint={s.reserve.mode === "percent" ? `${s.reserve.value}%` : `${fmtMoney(String(s.reserve.value * 100))} × ${report.distribution.months} month${report.distribution.months === 1 ? "" : "s"}`} />
              <Line2 label="To share" value={report.distribution.distributable} strong />
              {report.distribution.partners.length > 0 ? report.distribution.partners.map((p) => (
                <div key={p.name} className="flex items-baseline justify-between gap-3 py-1 pl-3 text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{p.name} <span className="text-xs text-gray-400">{p.percent}%</span></span>
                  <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">{fmtMoney(p.amount)}</span>
                </div>
              )) : <p className="pt-1 text-xs text-gray-400">Add partners in Report settings (⚙) to see each one&apos;s share.</p>}
              {s.showShares && big(t.shares) > 0n && (
                <p className="mt-2 text-xs text-gray-500">Already taken out this period (withdrawals): {fmtMoney(t.shares)}</p>
              )}
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Cash flow</h3>
              <Line2 label="Money in" value={t.cashIn} hint="MMK wallets" />
              <Line2 label="Money out" value={t.cashOut} minus hint="incl. stock bought" />
              <Line2 label="Net cash flow" value={t.netCash} strong />
              <div className="mt-3 text-xs text-gray-500">
                Stock bought this period: {fmtMoney(report.purchases.total)} ({report.purchases.count} purchases). Buying stock is cash out, not an expense; it becomes cost when sold.
              </div>
              {report.wallets.length > 0 && (
                <div className="mt-3 space-y-1">
                  {report.wallets.map((w) => (
                    <div key={w.name} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-gray-600 dark:text-gray-300">{w.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-500">
                        {fmtMoney(w.opening)} → <span className="font-semibold text-gray-900 dark:text-gray-100">{fmtMoney(w.closing)}</span> {w.currency}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {report.rows.length > 1 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">{report.groupBy === "day" ? "Day by day" : "Month by month"}</h3>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chart}>
                  <XAxis dataKey="period" fontSize={11} />
                  <YAxis fontSize={11} width={70} tickFormatter={(v) => Number(v).toLocaleString()} />
                  <Tooltip formatter={(v) => Number(v).toLocaleString()} />
                  <Legend />
                  <Bar dataKey="income" fill="#2563eb" name="Income" />
                  <Bar dataKey="expense" fill="#dc2626" name="Expense" />
                  <Line dataKey="profit" stroke="#16a34a" strokeWidth={2} name="Net profit" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card>
            <h3 className="mb-3 text-sm font-semibold">{report.groupBy === "day" ? "Daily summary" : "Monthly summary"}</h3>
            <Table
              headers={[report.groupBy === "day" ? "Date" : "Month", "Sales", "Service", "Top-up", "Other", "Income", "Gross profit", "Expense", ...(showSalary ? ["Salary"] : []), "Net profit", ...(s.showShares ? ["Shares"] : []), "Net cash"]}
              rightAlign={Array.from({ length: 13 }, (_, i) => i + 1)}
            >
              {[...report.rows, { ...t, period: "Total" }].map((r) => {
                const total = r.period === "Total";
                const empty = !total && big(r.totalIncome) === 0n && big(r.expense) === 0n && big(r.salary) === 0n && big(r.cashIn) === 0n && big(r.cashOut) === 0n;
                return (
                  <tr key={r.period} className={cn(total && "bg-gray-50 font-semibold dark:bg-gray-800/60", empty && "text-gray-400")}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{r.period}</td>
                    {[r.sales, r.service, r.topup, r.otherIncome, r.totalIncome, r.grossProfit, r.expense, ...(showSalary ? [r.salary] : [])].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-right tabular-nums">{fmtMoney(v)}</td>
                    ))}
                    <td className={cn("px-3 py-2 text-right tabular-nums", !empty && tone(r.netProfit))}>{fmtMoney(r.netProfit)}</td>
                    {s.showShares && <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.shares)}</td>}
                    <td className={cn("px-3 py-2 text-right tabular-nums", !empty && tone(r.netCash))}>{fmtMoney(r.netCash)}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Expenses by category</h3>
              {report.expenseByCategory.length === 0 ? <p className="text-sm text-gray-400">No expenses</p> : report.expenseByCategory.map((c) => (
                <div key={c.name} className="flex justify-between gap-2 py-1 text-sm">
                  <span className="truncate">{c.name}{c.salary && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Salary</span>}</span>
                  <span className="tabular-nums">{fmtMoney(c.amount)}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Other income by category</h3>
              {report.incomeByCategory.length === 0 ? <p className="text-sm text-gray-400">No other income</p> : report.incomeByCategory.map((c) => (
                <div key={c.name} className="flex justify-between gap-2 py-1 text-sm">
                  <span className="truncate">{c.name}</span><span className="tabular-nums">{fmtMoney(c.amount)}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Sales by item</h3>
              {report.salesByItem.length === 0 ? <p className="text-sm text-gray-400">No sales</p> : (
                <>
                  <Table headers={["Item", "Qty", "Sales", "Profit"]} rightAlign={[1, 2, 3]}>
                    {(showAllItems ? report.salesByItem : report.salesByItem.slice(0, 15)).map((i) => (
                      <tr key={i.name}>
                        <td className="max-w-[14rem] truncate px-3 py-2">{i.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(i.revenue)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", tone(i.profit))}>{fmtMoney(i.profit)}</td>
                      </tr>
                    ))}
                  </Table>
                  {report.salesByItem.length > 15 && (
                    <button className="no-print mt-2 text-sm text-blue-600" onClick={() => setShowAllItems(!showAllItems)}>
                      {showAllItems ? "Show top 15" : `Show all ${report.salesByItem.length} items`}
                    </button>
                  )}
                </>
              )}
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Repairs</h3>
              {([["Taken in", report.repairs.received], ["Finished", report.repairs.finished], ["Delivered", report.repairs.delivered], ["Cancelled", report.repairs.cancelled]] as const).map(([label, n]) => (
                <div key={label} className="flex justify-between py-1 text-sm"><span className="text-gray-600 dark:text-gray-300">{label}</span><span className="tabular-nums">{n}</span></div>
              ))}
              <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold dark:border-gray-700">
                <span>Money collected</span><span className="tabular-nums">{fmtMoney(report.repairs.collected)}</span>
              </div>
            </Card>
          </div>

          {owner && <div className="no-print"><GsheetBackupCard period={kind} date={value} from={from} to={to} label={report.period.label} /></div>}
        </>
      )}

      {owner && <ReportSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} />}
    </div>
  );
}

/** Which expense categories are staff salary, and whether shares show. Owner only. */
function ReportSettingsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const [cats, setCats] = useState<string[]>([]);
  const [salary, setSalary] = useState<string[]>([]);
  const [shares, setShares] = useState(true);
  const [generalTo, setGeneralTo] = useState<Section>("service");
  const [reserveMode, setReserveMode] = useState<"percent" | "amount">("percent");
  const [reserveValue, setReserveValue] = useState("0");
  const [partners, setPartners] = useState<{ name: string; percent: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => api<{ name: string }[]>("/api/v1/categories?type=EXPENSE").then((list) => setCats(list.map((c) => c.name)));
  useEffect(() => {
    if (!open) return;
    Promise.all([
      api<{ name: string }[]>("/api/v1/categories?type=EXPENSE"),
      api<Settings>("/api/v1/reports/settings"),
    ]).then(([list, cfg]) => {
      setCats(list.map((c) => c.name));
      setSalary(cfg.salaryCategories);
      setShares(cfg.showShares);
      setGeneralTo(cfg.generalExpenseTo);
      setReserveMode(cfg.reserve.mode);
      setReserveValue(String(cfg.reserve.value));
      setPartners(cfg.partners.map((p) => ({ name: p.name, percent: p.percent ? String(p.percent) : "" })));
    }).catch((e) => push(e.message, "error"));
  }, [open, push]);

  async function addSalaryCategory() {
    setBusy(true);
    try {
      const name = "Staff Salary";
      if (!cats.some((c) => c.toLowerCase() === name.toLowerCase())) await api("/api/v1/categories", { method: "POST", body: { type: "EXPENSE", name } });
      await refresh();
      setSalary((s) => (s.includes(name) ? s : [...s, name]));
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await api("/api/v1/reports/settings", {
        method: "PUT",
        body: {
          salaryCategories: salary, showShares: shares, generalExpenseTo: generalTo,
          reserve: { mode: reserveMode, value: Number(reserveValue.replace(/,/g, "")) || 0 },
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

  return (
    <Modal open={open} onClose={onClose} title="Report settings">
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-sm font-semibold">Staff salary (optional)</div>
          <p className="mb-2 text-xs text-gray-500">Tick the expense categories that are staff pay. They show as their own &quot;Staff salary&quot; line.</p>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
            {cats.map((c) => (
              <label key={c} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={salary.includes(c)} onChange={(e) => setSalary((s) => (e.target.checked ? [...s, c] : s.filter((x) => x !== c)))} />
                {c}
              </label>
            ))}
          </div>
          {!cats.some((c) => /salary|လစာ/i.test(c)) && (
            <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={addSalaryCategory}>+ Add a &quot;Staff Salary&quot; category</Button>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={shares} onChange={(e) => setShares(e.target.checked)} />
          <span>
            <span className="font-semibold">Show shares (optional)</span>
            <span className="block text-xs text-gray-500">Owner and partner withdrawals, shown after net profit. Record them in Income / Expense as Withdraw.</span>
          </span>
        </label>
        <div>
          <div className="mb-1 text-sm font-semibold">General expenses come out of</div>
          <p className="mb-2 text-xs text-gray-500">Daily General Expense and your own expense categories (rent, electricity…).</p>
          <select value={generalTo} onChange={(e) => setGeneralTo(e.target.value as Section)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm w-full">
            <option value="service">Service section</option>
            <option value="sales">Sales section</option>
            <option value="topup">Top-up &amp; bill section</option>
            <option value="general">A General section of its own</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Capital kept for next month</div>
          <p className="mb-2 text-xs text-gray-500">Taken from net profit (after salary) before the partners share the rest.</p>
          <div className="flex gap-2">
            <select value={reserveMode} onChange={(e) => setReserveMode(e.target.value as "percent" | "amount")} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm">
              <option value="percent">% of net profit</option>
              <option value="amount">MMK each month</option>
            </select>
            <input inputMode="decimal" value={reserveValue} onChange={(e) => setReserveValue(e.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm min-w-0 flex-1 text-right" />
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Partners</div>
          <p className="mb-2 text-xs text-gray-500">Leave every % empty to share equally (3 partners = a third each), or give each a % that adds up to 100.</p>
          <div className="space-y-2">
            {partners.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="Name" value={p.name} onChange={(e) => setPartners((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm min-w-0 flex-1" />
                <input placeholder="%" inputMode="decimal" value={p.percent} onChange={(e) => setPartners((l) => l.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm w-20 text-right" />
                <Button variant="ghost" aria-label="Remove partner" onClick={() => setPartners((l) => l.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
          </div>
          {partners.length < 10 && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPartners((l) => [...l, { name: `Boss ${l.length + 1}`, percent: "" }])}>+ Add partner</Button>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

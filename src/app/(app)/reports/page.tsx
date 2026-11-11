"use client";

import { shopZone } from "@/lib/dates";
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
interface Margin { income: Money; cost: Money; profit: Money; percent: number | null }
interface Row {
  period: string; inc: Cols; exp: Cols; net: Money; salary: Money; netProfit: Money;
  margin: { sales: Margin; service: Margin; topup: Margin; all: Margin };
}
interface Settings {
  salaryCategories: string[]; showShares: boolean; generalExpenseTo: Sec;
  reserve: { mode: "percent" | "amount"; value: number }; partners: { name: string; percent: number }[];
  stockCategoryIds: string[];
  stockIn: { download: boolean; sheet: boolean };
  stockColumns: "auto" | "brand" | "category";
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
  /** What makes up Other income, per period and for "Total". */
  otherIncomeBy?: Record<string, { label: string; amount: Money }[]>;
  serviceBy?: Record<string, { date: string; label: string; amount: Money }[]>;
  repairParts?: "stock" | "job";
  days?: OffDayReport;
}
interface DayCounts { open: number; off: number; none: number; noneDates: string[]; offDates: string[] }
interface OffDayReport {
  config: { weekly: number[]; days: string[] };
  period: DayCounts;
  year: DayCounts & { year: string };
}
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const big = (m: Money) => BigInt(m);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: shopZone() }).format(new Date());
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
  // The period whose Other income is opened, to see what it is made of.
  const [otherFor, setOtherFor] = useState<string | null>(null);
  const [serviceFor, setServiceFor] = useState<string | null>(null);
  const [value, setValue] = useState(() => today().slice(0, 7));
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  // The report and the query it answers, so a newer pick shows as loading.
  const [loaded, setLoaded] = useState<{ query: string; report: Report } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  /** Marks a day off (or takes the mark away): owner only. */
  async function setOff(date: string, off: boolean) {
    try {
      await api("/api/v1/reports/off-days", { method: "PUT", body: { date, off } });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

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
                        <td className="whitespace-nowrap px-1.5 py-1.5">
                          {report.groupBy === "day" && !total ? r.period.slice(5) : r.period}
                          {report.groupBy === "day" && !total && <DayTag date={r.period} days={report.days} owner={owner} onSet={setOff} />}
                        </td>
                        {cells.map((v, i) => {
                          const tappable = i === parts.length && (report.otherIncomeBy?.[r.period]?.length ?? 0) > 0;
                          // The Service income cell opens the repair payments behind it.
                          const serviceCell = parts[i]?.[0] === "service" && (report.serviceBy?.[r.period]?.length ?? 0) > 0;
                          const link = "text-blue-600 underline decoration-dotted underline-offset-2";
                          return (
                            <td key={i} className={cn("px-1.5 py-1.5 text-right tabular-nums", (i === 0 || i === half) && "border-l border-gray-100 dark:border-gray-800", (i === half - 1 || i === 2 * half - 1) && "font-semibold")}>
                              {tappable
                                ? <button type="button" className={link} onClick={() => setOtherFor(r.period)}>{fmtMoney(v)}</button>
                                : serviceCell
                                  ? <button type="button" className={link} onClick={() => setServiceFor(r.period)}>{fmtMoney(v)}</button>
                                  : fmtMoney(v)}
                            </td>
                          );
                        })}
                        <td className={cn("border-l border-gray-100 px-1.5 py-1.5 text-right font-semibold tabular-nums dark:border-gray-800", !empty && tone(r.net))}>{fmtMoney(r.net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {report.days && <OffDaySummary days={report.days} owner={owner} onWeekly={() => setWeeklyOpen(true)} />}

          <GrossMargin report={report} parts={parts} />

          {owner && (
            <Link href="/settings#sheets" className="no-print flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm hover:border-green-400 dark:border-gray-800 dark:bg-gray-900">
              <span className="flex items-center gap-2"><FileSpreadsheet size={18} className="text-green-600" />Google Sheet sync</span>
              <span className="text-blue-600">Settings →</span>
            </Link>
          )}
        </>
      )}

      <Modal open={Boolean(otherFor)} onClose={() => setOtherFor(null)} title={`Other income · ${otherFor === "Total" ? "Total" : otherFor ?? ""}`}>
        <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
          {(otherFor ? report?.otherIncomeBy?.[otherFor] ?? [] : []).map((l) => (
            <li key={l.label} className="flex justify-between gap-3 py-2">
              <span>{l.label}</span><b className="tabular-nums">{fmtMoney(l.amount)}</b>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={Boolean(serviceFor)} onClose={() => setServiceFor(null)} title={`Service · ${serviceFor ?? ""}`}>
        <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
          {(serviceFor ? report?.serviceBy?.[serviceFor] ?? [] : []).map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                {serviceFor && serviceFor.length !== 10 && <span className="mr-2 text-xs text-gray-500">{l.date.slice(5)}</span>}
                {l.label}
              </span>
              <b className={cn("shrink-0 tabular-nums", big(l.amount) < 0n && "text-red-600")}>{fmtMoney(l.amount)}</b>
            </li>
          ))}
        </ul>
      </Modal>

      {owner && report?.days && (
        <WeeklyOffModal key={weeklyOpen ? "open" : "shut"} open={weeklyOpen} onClose={() => setWeeklyOpen(false)} weekly={report.days.config.weekly} onSaved={load} />
      )}

      {owner && <ReportSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} shown={report?.shown ?? { sales: true, service: true, topup: true }} />}
    </div>
  );
}

/** Beside a day in the Daily summary: Off day, or No records (which the owner can mark off). */
function DayTag({ date, days, owner, onSet }: { date: string; days?: OffDayReport; owner: boolean; onSet: (date: string, off: boolean) => void }) {
  if (!days) return null;
  const pill = "ml-1.5 rounded px-1 py-0.5 text-[10px] font-medium";
  if (days.period.offDates.includes(date)) {
    // A date marked off can be unmarked; a weekly off day is changed in its own setting.
    const marked = days.config.days.includes(date);
    return owner && marked
      ? <button type="button" title="Take the off day mark away" className={cn(pill, "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200")} onClick={() => onSet(date, false)}>{"Off day"} ×</button>
      : <span className={cn(pill, "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200")}>{"Off day"}</span>;
  }
  if (days.period.noneDates.includes(date)) {
    return owner
      ? <button type="button" className={cn(pill, "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200")} onClick={() => onSet(date, true)}>{"No records · Mark off"}</button>
      : <span className={cn(pill, "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200")}>{"No records"}</span>;
  }
  return null;
}

/** Open days, off days and days with nothing recorded: this period and its year. */
function OffDaySummary({ days, owner, onWeekly }: { days: OffDayReport; owner: boolean; onWeekly: () => void }) {
  const stat = (label: string, n: number, cls = "") => (
    <span className="whitespace-nowrap"><span className="text-gray-500">{label}</span> <b className={cn("tabular-nums", cls)}>{n}</b></span>
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{"Off days"}</h3>
        {owner && (
          <Button size="sm" variant="ghost" onClick={onWeekly}>
            {days.config.weekly.length ? `${"Weekly off day"}: ${days.config.weekly.map((d) => WEEKDAYS[d]).join(", ")}` : "Weekly off day"}
          </Button>
        )}
      </div>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="w-full text-xs font-medium text-gray-500">{"This period"}</span>
          {stat("Open days", days.period.open)}
          {stat("Off day", days.period.off)}
          {stat("No records", days.period.none, days.period.none > 0 ? "text-amber-600" : "")}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="w-full text-xs font-medium text-gray-500">{days.year.year}</span>
          {stat("Open days", days.year.open)}
          {stat("Off day", days.year.off)}
          {stat("No records", days.year.none, days.year.none > 0 ? "text-amber-600" : "")}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{"A day with nothing recorded counts as Off day only once it is marked off, or falls on the weekly off day. Days to come are not counted."}</p>
    </Card>
  );
}

/** The weekdays the shop is shut every week. Owner only. */
function WeeklyOffModal({ open, onClose, weekly, onSaved }: { open: boolean; onClose: () => void; weekly: number[]; onSaved: () => void }) {
  const { push } = useToast();
  const [picked, setPicked] = useState<number[]>(weekly);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/v1/reports/off-days", { method: "PUT", body: { weekly: picked } });
      onSaved();
      onClose();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Weekly off day">
      <p className="mb-2 text-xs text-gray-500">{"The shop is shut on these days every week. A day worked anyway counts as open."}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {WEEKDAYS.map((name, d) => (
          <label key={d} className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={picked.includes(d)} onChange={(e) => setPicked(e.target.checked ? [...picked, d] : picked.filter((x) => x !== d))} />
            {name}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

const pct = (m: Margin) => (m.percent === null ? "—" : `${m.percent.toFixed(1)}%`);

/** Gross margin of each part of the shop: income less what the goods or work directly cost,
 *  before rent, salary and other general expenses. How repair parts are costed (Settings →
 *  Repairs) says how to read Service: bought into stock, they count when bought, so the
 *  month is the unit that means something; bought per job, they count on the day paid. */
function GrossMargin({ report, parts }: { report: Report; parts: readonly (readonly [Exclude<Sec, "general">, string])[] }) {
  const rows = [...report.rows, { ...report.totals, period: "Total" }];
  const byDay = report.groupBy === "day";
  const stockParts = (report.repairParts ?? "stock") === "stock" && report.shown.service;
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">{"Gross margin"}</h3>
      <p className="mb-3 text-xs text-gray-500">{"Income less what the goods or work directly cost. Rent, salary and other general expenses are not taken off."}</p>
      <div className="max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full min-w-max text-xs lg:min-w-0">
          <thead className="bg-gray-50 text-[11px] text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
            <tr>
              <th />
              {[...parts.map(([, l]) => l), "All"].map((l) => (
                <th key={l} colSpan={3} className="border-l border-gray-200 px-1.5 pt-1.5 text-center font-semibold uppercase tracking-wide dark:border-gray-700">{l}</th>
              ))}
            </tr>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-1.5 py-1.5 text-left font-medium">{byDay ? "Date" : "Month"}</th>
              {[...parts, ["all", "All"] as const].flatMap(([k]) => [
                <th key={`${k}c`} className="border-l border-gray-200 px-1.5 py-1.5 text-right font-medium dark:border-gray-700">{"Direct cost"}</th>,
                <th key={`${k}p`} className="px-1.5 py-1.5 text-right font-medium">{"Gross profit"}</th>,
                <th key={`${k}m`} className="px-1.5 py-1.5 text-right font-medium">{"Margin %"}</th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
            {rows.map((r) => {
              const total = r.period === "Total";
              return (
                <tr key={r.period} className={cn(total && "bg-gray-50 font-semibold dark:bg-gray-800/60")}>
                  <td className="whitespace-nowrap px-1.5 py-1.5">{byDay && !total ? r.period.slice(5) : r.period}</td>
                  {[...parts.map(([k]) => r.margin[k]), r.margin.all].flatMap((m, i) => [
                    <td key={`${i}c`} className="border-l border-gray-100 px-1.5 py-1.5 text-right tabular-nums dark:border-gray-800">{fmtMoney(m.cost)}</td>,
                    <td key={`${i}p`} className={cn("px-1.5 py-1.5 text-right tabular-nums", big(m.income) > 0n && tone(m.profit))}>{fmtMoney(m.profit)}</td>,
                    <td key={`${i}m`} className={cn("px-1.5 py-1.5 text-right font-semibold tabular-nums", m.percent !== null && m.percent < 0 && "text-red-600 dark:text-red-400")}>{pct(m)}</td>,
                  ])}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-gray-500">
        {stockParts && <li>{"Repair parts count on the day they are bought (Settings → Repairs: From stock). A month that stocks up shows a lower Service margin, the next a higher one."}</li>}
        {!stockParts && report.shown.service && <li>{"Repair parts count on the day the job is paid (Settings → Repairs: Bought per job)."}</li>}
        {stockParts && byDay && <li>{"Day by day the margin swings with what was bought that day; read it by Month or Year."}</li>}
        {report.shown.sales && <li>{"Daily Sale Income typed as a day's total has no cost behind it unless the stock bought is put into expense, so its margin shows too high."}</li>}
      </ul>
    </Card>
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

          <section className="space-y-2">
            <div className="text-sm font-semibold">2. Stock sheet</div>
            <p className="text-xs text-gray-500">Current stock of the item categories ticked below, as a sheet of its own in the files. Not shown on this page.</p>
            <div>
              <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Goes in</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.stockIn.download} onChange={(e) => setCfg({ ...cfg, stockIn: { ...cfg.stockIn, download: e.target.checked } })} />
                  Download (CSV / Excel)
                </label>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.stockIn.sheet} onChange={(e) => setCfg({ ...cfg, stockIn: { ...cfg.stockIn, sheet: e.target.checked } })} />
                  Google Sheet
                </label>
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Columns</span>
              <select value={cfg.stockColumns} onChange={(e) => setCfg({ ...cfg, stockColumns: e.target.value as Settings["stockColumns"] })} className={cn(field, "w-full")}>
                <option value="auto">Automatic (phone shop: by brand)</option>
                <option value="brand">By phone brand, read from the item name</option>
                <option value="category">By sub-category</option>
              </select>
            </label>
            <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Item categories (sub-categories come with them)</div>
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

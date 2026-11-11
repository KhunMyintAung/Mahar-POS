"use client";

import { shopZone } from "@/lib/dates";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { StatCard, Card, Select, Input, Spinner, useToast } from "@/components/ui";
import { useAuth, useCurrency } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { CityPrompt } from "@/components/CityPrompt";

interface Summary {
  wallets: { totalMmk: string; totalThb: string; thbWallets: number; lowBalance: { id: string; name: string; currentBalance: string; minBalance: string }[] };
  credit: { newIssued: string; collected: string; outstanding: string };
  payable: { newIssued: string; paid: string; outstanding: string };
  general: { otherIncome: string; expense: string; netCashMovement: string };
}

interface DashData {
  date: string;
  summary: Summary;
  pos?: {
    salesCount: number;
    salesTotal: string;
    salesProfit: string | null; // null for staff who may not see costs
    lowStock: { id: string; name: string; minStock: number; qty: number }[];
    /** On the shelf and expired, or expiring within a month (YYYY-MM-DD). */
    expiring: { id: string; name: string; qty: number; expiresAt: string }[];
    /** What the shelf cost, and what it is priced at. */
    stockCost: string | null;
    stockRetail: string;
    stockItems: number;
  };
  income?: { sales: string; service: string; topup: string; other: string; total: string; lines: { label: string; amount: string }[] };
  expense?: { total: string; lines: { label: string; amount: string }[] };
  /** Repairs paid that day (those who may see costs). */
  service?: { charge: string; parts: string; expense?: string; profit: string; otherIncome?: string };
}

/** Today in the shop's time zone, to label the income card. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: shopZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** A total and the lines that make it up, in small type. */
function DayLines({ title, total, lines, tone, empty }: {
  title: string; total: string; lines: { label: string; amount: string }[]; tone: "green" | "red"; empty: string;
}) {
  const cur = useCurrency();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className={tone === "green" ? "inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700/85 dark:text-emerald-300/80" : "inline-flex items-center gap-1.5 text-sm font-medium text-red-700/85 dark:text-red-300/80"}>
          <span aria-hidden className={tone === "green" ? "h-1.5 w-1.5 rounded-full bg-emerald-500/60" : "h-1.5 w-1.5 rounded-full bg-red-500/60"} />
          {title}
        </span>
        <span className="text-lg font-bold tabular-nums">{fmtMoney(total, cur)}</span>
      </div>
      {lines.length === 0 ? (
        <div className="text-xs text-gray-400">{empty}</div>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs">
          {lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-2">
              <span className="truncate text-gray-600 dark:text-gray-400">{l.label}</span>
              <span className="shrink-0 tabular-nums">{fmtMoney(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const cur = useCurrency();
  const [data, setData] = useState<DashData | null>(null);
  const [date, setDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const { branches, featureEnabled, hasPerm } = useAuth();
  const { push } = useToast();
  const router = useRouter();
  const canView = hasPerm("dashboard.view");

  useEffect(() => {
    if (canView) return;
    const start = ([["repair.view", "/repairs"], ["sale.create", "/pos"], ["sale.view", "/sales"], ["item.view", "/items"], ["stock.view", "/items"], ["wallet.view", "/wallets"]] as const)
      .find(([perm]) => hasPerm(perm));
    router.replace(start ? start[1] : "/about");
  }, [canView, hasPerm, router]);

  const load = useCallback(() => {
    if (!canView) return;
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (branchId) params.set("branchId", branchId);
    api<DashData>(`/api/v1/dashboard/summary?${params}`)
      .then(setData)
      .catch((e) => push(e.message, "error"));
  }, [date, branchId, push, canView]);

  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const s = data.summary;

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <CityPrompt />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageHeader title={<>Dashboard</>} />
          <p className="text-sm text-gray-500 dark:text-gray-400">{data.date}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Input type="date" value={date || data.date} onChange={(e) => setDate(e.target.value)} />
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      </div>

      {data.income && (
        // Every source the day's money came from, and every kind of expense, each on a line:
        // small enough to sit above the cards, whole enough that nothing entered is missing.
        <Card className="grid gap-3 sm:grid-cols-2">
          <DayLines
            title={data.date === today() ? "Today's Total Income" : "Total Income"}
            total={data.income.total}
            lines={data.income.lines}
            tone="green"
            empty="No income yet"
          />
          {data.expense && (
            <DayLines
              title={data.date === today() ? "Today's Expense" : "Expense"}
              total={data.expense.total}
              lines={data.expense.lines}
              tone="red"
              empty="No expense yet"
            />
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {featureEnabled("pos") && data.pos && (
          <>
            <StatCard label="Today's Sales" value={fmtMoney(data.pos.salesTotal, cur)} sub={`${data.pos.salesCount} sale(s)`} onClick={() => router.push("/sales")} />
            {data.pos.salesProfit !== null && (
              <StatCard label="Sales Profit" value={fmtMoney(data.pos.salesProfit, cur)} tone={BigInt(data.pos.salesProfit) >= 0n ? "green" : "red"} onClick={() => router.push("/sales")} />
            )}
          </>
        )}
        {featureEnabled("repair") && data.service && (
          <>
            <StatCard
              label="Repair income"
              value={fmtMoney(data.service.charge, cur)}
              sub={BigInt(data.service.otherIncome ?? "0") > 0n ? `Other income ${fmtMoney(data.service.otherIncome ?? "0", cur)}` : undefined}
              onClick={() => router.push("/repairs")}
            />
            <StatCard label="Repair profit" value={fmtMoney(data.service.profit, cur)} sub={`Repair expense ${fmtMoney(data.service.expense ?? "0", cur)}`} tone={BigInt(data.service.profit) >= 0n ? "green" : "red"} onClick={() => router.push("/repairs")} />
          </>
        )}
        {featureEnabled("stock") && data.pos && (
          <>
            {/* What the shelf cost is the figure that matters to an owner: it is money
                already spent and sitting there. The retail figure sits underneath it
                rather than in its own card, because the two are only meaningful together. */}
            {data.pos.stockCost !== null && (
              <StatCard
                label="Stock Value (cost)"
                value={fmtMoney(data.pos.stockCost, cur)}
                sub={`${data.pos.stockItems} item(s) in stock`}
                onClick={() => router.push("/items")}
              />
            )}
            <StatCard
              label="Stock Value (retail)"
              value={fmtMoney(data.pos.stockRetail, cur)}
              sub={data.pos.stockCost !== null
                ? `${fmtMoney(String(BigInt(data.pos.stockRetail) - BigInt(data.pos.stockCost)), cur)} if it all sells`
                : `${data.pos.stockItems} item(s) in stock`}
              tone="green"
              onClick={() => router.push("/items")}
            />
          </>
        )}
        {featureEnabled("wallets") && <>
        <StatCard label="Total MMK Balance" value={fmtMoney(s.wallets.totalMmk, cur)} onClick={() => router.push("/wallets")} />
        {/* A shop with no THB wallet has nothing to show here, so the card stays out of the way. */}
        {s.wallets.thbWallets > 0 && (
          <StatCard label="Total THB Balance" value={fmtMoney(s.wallets.totalThb, "THB")} onClick={() => router.push("/wallets")} />
        )}
        </>}
        {featureEnabled("credit") && <>
        <StatCard label="Customer Receivable" value={fmtMoney(s.credit.outstanding, cur)} tone="blue" onClick={() => router.push("/credit")} />
        <StatCard label="Business Payable" value={fmtMoney(s.payable.outstanding, cur)} tone="amber" onClick={() => router.push("/credit?tab=payable")} />
        </>}
        {featureEnabled("incomeExpense") && <>
        <StatCard label="Today's Income" value={fmtMoney(s.general.otherIncome, cur)} tone="green" onClick={() => router.push("/income-expense")} />
        <StatCard label="Today's Expense" value={fmtMoney(s.general.expense, cur)} tone="red" onClick={() => router.push("/income-expense")} />
        <StatCard label="Net Cash Movement" value={fmtMoney(s.general.netCashMovement, cur)} tone={BigInt(s.general.netCashMovement) >= 0n ? "green" : "red"} />
        </>}
        {featureEnabled("credit") && <>
        <StatCard label="Credit Collected Today" value={fmtMoney(s.credit.collected, cur)} tone="green" onClick={() => router.push("/credit")} />
        <StatCard label="Payable Paid Today" value={fmtMoney(s.payable.paid, cur)} onClick={() => router.push("/credit?tab=payable")} />
        </>}
      </div>

      {featureEnabled("stock") && data.pos && data.pos.lowStock.length > 0 && (
        <Card>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500/70" />Low stock alerts</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {data.pos.lowStock.map((it) => (
              <li key={it.id}>
                {it.name}: <b className="text-red-700/90 dark:text-red-300/90">{it.qty}</b> {`(min ${it.minStock})`}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {featureEnabled("items") && data.pos && data.pos.expiring.length > 0 && (
        <Card>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-500/80" />Expiring soon</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {data.pos.expiring.map((it) => (
              <li key={it.id}>
                {it.name}: <b className={it.expiresAt < today() ? "text-red-600" : "text-amber-700 dark:text-amber-400"}>{it.expiresAt}</b> {`(${it.qty} left)`}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {featureEnabled("wallets") && s.wallets.lowBalance.length > 0 && (
        <Card>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-500/80" />Low wallet balance alerts</h3>
          <ul className="space-y-1 text-sm">
            {s.wallets.lowBalance.map((w) => (
              <li key={w.id}>
                {w.name}: <span className="font-medium text-red-700/90 dark:text-red-300/90">{fmtMoney(w.currentBalance)}</span> {`(min ${fmtMoney(w.minBalance)})`}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
      </div>
    </div>
  );
}

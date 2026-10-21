"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { StatCard, Card, Select, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

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
    salesProfit: string;
    lowStock: { id: string; name: string; minStock: number; qty: number }[];
    /** What the shelf cost, and what it is priced at. */
    stockCost: string;
    stockRetail: string;
    stockItems: number;
  };
  income?: { sales: string; service: string; topup: string; other: string; total: string };
}

/** Today in the shop's time zone, to label the income card. */
const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [date, setDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const { branches, featureEnabled } = useAuth();
  const { push } = useToast();
  const router = useRouter();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (branchId) params.set("branchId", branchId);
    api<DashData>(`/api/v1/dashboard/summary?${params}`)
      .then(setData)
      .catch((e) => push(e.message, "error"));
  }, [date, branchId, push]);

  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const s = data.summary;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
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
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-green-800 dark:text-green-300">{data.date === todayDate ? "Today's Total Income" : "Total Income"}</div>
              <div className="text-3xl font-bold tabular-nums">{fmtMoney(data.income.total, "MMK")}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {([
                ["Sales", data.income.sales, featureEnabled("pos")],
                ["Service", data.income.service, featureEnabled("repair")],
                ["Top-up & Bill", data.income.topup, featureEnabled("biller")],
                ["Other income", data.income.other, true],
              ] as const).filter(([, v, on]) => on || BigInt(v) !== 0n).map(([label, v]) => (
                <div key={label}>
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="font-semibold tabular-nums">{fmtMoney(v, "MMK")}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {featureEnabled("pos") && data.pos && (
          <>
            <StatCard label="Today's Sales" value={fmtMoney(data.pos.salesTotal, "MMK")} sub={`${data.pos.salesCount} sale(s)`} onClick={() => router.push("/sales")} />
            <StatCard label="Sales Profit" value={fmtMoney(data.pos.salesProfit, "MMK")} tone={BigInt(data.pos.salesProfit) >= 0n ? "green" : "red"} onClick={() => router.push("/sales")} />
          </>
        )}
        {featureEnabled("stock") && data.pos && (
          <>
            {/* What the shelf cost is the figure that matters to an owner: it is money
                already spent and sitting there. The retail figure sits underneath it
                rather than in its own card, because the two are only meaningful together. */}
            <StatCard
              label="Stock Value (cost)"
              value={fmtMoney(data.pos.stockCost, "MMK")}
              sub={`${data.pos.stockItems} item(s) in stock`}
              onClick={() => router.push("/stock")}
            />
            <StatCard
              label="Stock Value (retail)"
              value={fmtMoney(data.pos.stockRetail, "MMK")}
              sub={`${fmtMoney(String(BigInt(data.pos.stockRetail) - BigInt(data.pos.stockCost)), "MMK")} if it all sells`}
              tone="green"
              onClick={() => router.push("/stock")}
            />
          </>
        )}
        {featureEnabled("wallets") && <>
        <StatCard label="Total MMK Balance" value={fmtMoney(s.wallets.totalMmk, "MMK")} onClick={() => router.push("/wallets")} />
        {/* A shop with no THB wallet has nothing to show here, so the card stays out of the way. */}
        {s.wallets.thbWallets > 0 && (
          <StatCard label="Total THB Balance" value={fmtMoney(s.wallets.totalThb, "THB")} onClick={() => router.push("/wallets")} />
        )}
        </>}
        {featureEnabled("credit") && <>
        <StatCard label="Customer Receivable" value={fmtMoney(s.credit.outstanding, "MMK")} tone="blue" onClick={() => router.push("/credit")} />
        <StatCard label="Business Payable" value={fmtMoney(s.payable.outstanding, "MMK")} tone="amber" onClick={() => router.push("/credit?tab=payable")} />
        </>}
        {featureEnabled("incomeExpense") && <>
        <StatCard label="Today's Income" value={fmtMoney(s.general.otherIncome, "MMK")} tone="green" onClick={() => router.push("/income-expense")} />
        <StatCard label="Today's Expense" value={fmtMoney(s.general.expense, "MMK")} tone="red" onClick={() => router.push("/income-expense")} />
        <StatCard label="Net Cash Movement" value={fmtMoney(s.general.netCashMovement, "MMK")} tone={BigInt(s.general.netCashMovement) >= 0n ? "green" : "red"} />
        </>}
        {featureEnabled("credit") && <>
        <StatCard label="Credit Collected Today" value={fmtMoney(s.credit.collected, "MMK")} tone="green" onClick={() => router.push("/credit")} />
        <StatCard label="Payable Paid Today" value={fmtMoney(s.payable.paid, "MMK")} onClick={() => router.push("/credit?tab=payable")} />
        </>}
      </div>

      {featureEnabled("stock") && data.pos && data.pos.lowStock.length > 0 && (
        <Card className="border-red-300 dark:border-red-800">
          <h3 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">Low stock alerts</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {data.pos.lowStock.map((it) => (
              <li key={it.id}>
                {it.name}: <b className="text-red-600">{it.qty}</b> (min {it.minStock})
              </li>
            ))}
          </ul>
        </Card>
      )}

      {featureEnabled("wallets") && s.wallets.lowBalance.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Low wallet balance alerts</h3>
          <ul className="space-y-1 text-sm">
            {s.wallets.lowBalance.map((w) => (
              <li key={w.id}>
                {w.name}: <span className="font-medium text-red-600">{fmtMoney(w.currentBalance)}</span> (min {fmtMoney(w.minBalance)})
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { StatCard, Card, Select, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Summary {
  wallets: { totalMmk: string; totalThb: string; lowBalance: { id: string; name: string; currentBalance: string; minBalance: string }[] };
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
}

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
        <StatCard label="Total THB Balance" value={fmtMoney(s.wallets.totalThb, "THB")} onClick={() => router.push("/wallets")} />
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

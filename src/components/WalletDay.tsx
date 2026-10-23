"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Card, StatCard, cn } from "@/components/ui";
import { Paginated } from "@/components/Pager";

interface Entry {
  id: string; walletId: string; walletName: string; currency: string; direction: "DEBIT" | "CREDIT";
  amount: string; balanceAfter: string; refType: string; description: string | null; createdAt: string;
}
interface Totals { moneyIn: string; moneyOut: string; transfers: string; withdrawals: string; count: number }
interface Day { date: string; totals: Record<string, Totals>; entries: Entry[] }

/** What each kind of wallet movement is called on screen. */
const KIND: Record<string, string> = {
  SALE: "Sale", PURCHASE: "Purchase", REPAIR_DEPOSIT: "Repair deposit", REPAIR_PAYMENT: "Repair payment",
  BILLER_TOPUP: "Bought float", BILLER_SALE: "Top-up sold", TRANSFER_IN: "Transfer in", TRANSFER_OUT: "Transfer out",
  EXCHANGE_IN: "Exchange in", EXCHANGE_OUT: "Exchange out", INCOME: "Income", EXPENSE: "Expense", WITHDRAW: "Withdraw",
  CREDIT_COLLECT: "Credit collected", CREDIT_DISBURSE: "Credit given", PAYABLE_PAY: "Supplier paid",
  ADJUSTMENT: "Adjustment", OPENING: "Opening", REVERSAL: "Void",
};
const FILTERS: [string, string, (e: Entry) => boolean][] = [
  ["all", "All", () => true],
  ["transfer", "Transfers", (e) => e.refType.startsWith("TRANSFER") || e.refType.startsWith("EXCHANGE")],
  ["withdraw", "Withdrawals", (e) => e.refType === "WITHDRAW"],
  ["in", "Money in", (e) => e.direction === "DEBIT"],
  ["out", "Money out", (e) => e.direction === "CREDIT"],
];

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
const shiftDay = (d: string, by: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + by);
  return x.toISOString().slice(0, 10);
};

/** The Wallets page's day view: the day's money in and out, transfers and withdrawals, and
 *  every movement across the wallets, for today or any day picked. */
export function WalletDay({ refreshKey }: { refreshKey?: unknown }) {
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<Day | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Day>(`/api/v1/wallets/day?date=${date}`).then((d) => { setDay(d); setError(""); }).catch((e) => setError(e.message));
  }, [date, refreshKey]);

  const mmk = day?.totals.MMK;
  const others = Object.entries(day?.totals ?? {}).filter(([c]) => c !== "MMK");
  const test = FILTERS.find(([k]) => k === filter)?.[2] ?? (() => true);
  const rows = (day?.entries ?? []).filter(test);
  const isToday = date === today();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{isToday ? "Today" : date} — money in &amp; out</h2>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={18} /></button>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
          <button type="button" aria-label="Next day" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))} className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"><ChevronRight size={18} /></button>
          {!isToday && <button type="button" onClick={() => setDate(today())} className="ml-1 text-sm text-blue-600">Today</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Money in" value={fmtMoney(mmk?.moneyIn ?? "0", "MMK")} tone="green" />
        <StatCard label="Money out" value={fmtMoney(mmk?.moneyOut ?? "0", "MMK")} tone="red" />
        <StatCard label="Net" value={fmtMoney((BigInt(mmk?.moneyIn ?? "0") - BigInt(mmk?.moneyOut ?? "0")).toString(), "MMK")} tone={BigInt(mmk?.moneyIn ?? "0") >= BigInt(mmk?.moneyOut ?? "0") ? "blue" : "red"} />
        <StatCard label="Transfers" value={fmtMoney(mmk?.transfers ?? "0", "MMK")} onClick={() => setFilter("transfer")} sub="Between your wallets" />
        <StatCard label="Withdrawals" value={fmtMoney(mmk?.withdrawals ?? "0", "MMK")} tone="amber" onClick={() => setFilter("withdraw")} />
      </div>
      {others.map(([cur, t]) => (
        <p key={cur} className="text-xs text-gray-500">{cur}: in {fmtMoney(t.moneyIn, cur)} · out {fmtMoney(t.moneyOut, cur)}</p>
      ))}

      <Card className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map(([k, label, f]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", filter === k ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 dark:border-gray-700")}>
              {label} <span className="opacity-70">{(day?.entries ?? []).filter(f).length}</span>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {day && rows.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No wallet movements {isToday ? "today" : "on this day"}</p>}
        {rows.length > 0 && (
          <Paginated rows={rows} resetKey={[date, filter]}>{(pageRows) => (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {pageRows.map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-gray-500">{new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">{KIND[e.refType] ?? e.refType}</span>
                      <span className="text-xs text-gray-500">{e.walletName}</span>
                    </div>
                    {e.description && <div className="truncate text-xs text-gray-500">{e.description}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("font-semibold tabular-nums", e.direction === "DEBIT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                      {e.direction === "DEBIT" ? "+" : "−"}{fmtMoney(e.amount)}
                    </div>
                    <div className="text-[11px] tabular-nums text-gray-400">{`bal ${fmtMoney(e.balanceAfter)}`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}</Paginated>
        )}
      </Card>
    </div>
  );
}

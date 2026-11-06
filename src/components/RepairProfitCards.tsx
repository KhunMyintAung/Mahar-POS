"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/components/ui";

interface Totals { count: number; charge: string; parts: string; profit: string }

/** Today's service profit, one slim chip beside the Repairs tabs: repairs paid today, their
 *  charge, parts cost and profit. Tapping opens the day by day view. refresh: changes when the
 *  jobs reload. */
export function RepairProfitCards({ refresh, onOpen, className }: { refresh: unknown; onOpen: () => void; className?: string }) {
  const [t, setT] = useState<Totals | null>(null);
  useEffect(() => {
    let live = true;
    api<{ total: Totals }>("/api/v1/repairs/daily").then((d) => { if (live) setT(d.total); }).catch(() => {});
    return () => { live = false; };
  }, [refresh]);
  if (!t) return null;
  const items = [
    { label: "Charge", value: t.charge, tone: "text-blue-600 dark:text-blue-400" },
    { label: "Parts cost", value: t.parts, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Service profit", value: t.profit, tone: BigInt(t.profit) < 0n ? "text-red-600" : "text-emerald-600 dark:text-emerald-400" },
  ];
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Daily repair profit"
      className={cn("items-center gap-3 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm font-normal hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800", className)}
    >
      <span className="inline-flex items-baseline gap-1"><span className="text-gray-500">Today</span><b className="text-base tabular-nums">{t.count}</b></span>
      {items.map((c) => (
        <span key={c.label} className="inline-flex items-baseline gap-1">
          <span className="text-gray-500">{c.label}</span>
          <b className={cn("text-base tabular-nums", c.tone)}>{fmtMoney(c.value)}</b>
        </span>
      ))}
    </button>
  );
}

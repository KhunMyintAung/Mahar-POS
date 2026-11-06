"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/components/ui";

interface Totals { count: number; charge: string; parts: string; profit: string }

/** Today's service profit on the Repairs page: repairs paid today, their charge, parts cost
 *  and profit. Tapping opens the day by day view. refresh: changes when the jobs reload. */
export function RepairProfitCards({ refresh, onOpen }: { refresh: unknown; onOpen: () => void }) {
  const [t, setT] = useState<Totals | null>(null);
  useEffect(() => {
    let live = true;
    api<{ total: Totals }>("/api/v1/repairs/daily").then((d) => { if (live) setT(d.total); }).catch(() => {});
    return () => { live = false; };
  }, [refresh]);
  if (!t) return null;
  const cards = [
    { label: `Today's charge · ${t.count}`, value: t.charge, tone: "text-blue-600 dark:text-blue-400" },
    { label: "Parts cost", value: t.parts, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Service profit", value: t.profit, tone: BigInt(t.profit) < 0n ? "text-red-600" : "text-emerald-600 dark:text-emerald-400" },
  ];
  return (
    <button type="button" onClick={onOpen} title="Daily repair profit" className="grid w-full grid-cols-3 gap-2 text-left">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
          <div className="truncate text-[11px] text-gray-500">{c.label}</div>
          <div className={cn("text-base font-bold tabular-nums", c.tone)}>{fmtMoney(c.value)}</div>
        </div>
      ))}
    </button>
  );
}

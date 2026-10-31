"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { RepairSheet, RepairSheetRow } from "@/lib/repair-sheet";
import PosAd from "./PosAd";

type Filter = "all" | "pending" | "done" | "waiting";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "အားလုံး" },
  { key: "pending", label: "ပြင်ရန်" },
  { key: "waiting", label: "မယူရသေး" },
  { key: "done", label: "ပြင်ပြီး" },
];

const amount = (n: number) => n.toLocaleString("en-US");

function matches(row: RepairSheetRow, filter: Filter) {
  if (filter === "pending") return !row.done;
  if (filter === "done") return row.done;
  if (filter === "waiting") return row.done && !row.pickedUp;
  return true;
}

/** Laid out like the sheet itself: one line per phone, in the sheet's order, with date and
 *  name only where the sheet has them. */
export default function RepairSheetView({ shopName, sheet }: { shopName: string; sheet: RepairSheet | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => sheet?.rows ?? [], [sheet]);
  const stats = useMemo(() => {
    const done = rows.filter((r) => r.done).length;
    return { count: rows.length, done, pending: rows.length - done, total: rows.reduce((s, r) => s + r.cost, 0) };
  }, [rows]);
  const hasPayment = rows.some((r) => r.paymentStatus);

  const q = query.trim().toLowerCase();
  const filtered = filter !== "all" || q !== "";
  const visible = rows.filter((r) =>
    matches(r, filter) && (!q || [r.owner, r.model, r.part].some((v) => v.toLowerCase().includes(q))),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-4 sm:py-5">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h1 className="text-base font-bold">{shopName} <span className="text-xs font-normal text-gray-500">· ဖုန်းပြင်ဆင်မှု စာရင်း</span></h1>
        <p className="text-[11px] text-gray-500">Mahar Shwe Mobile · ၁ မိနစ်တိုင်း update</p>
      </header>

      {!sheet ? (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Google Sheet ကို ဖတ်မရသေးပါ။ ခဏနေ ပြန်ကြည့်ပေးပါ။
        </p>
      ) : (
        <>
          <p className="mb-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs dark:border-blue-900 dark:bg-blue-950/40">
            {sheet.totalLabel ?? "ငွေရှင်းရန် စုစုပေါင်း"} - <b className="tabular-nums">{amount(sheet.sheetTotal ?? stats.total)}</b>
            <span className="ml-2 text-gray-500">({stats.count} လုံး · ပြင်ပြီး {stats.done} · ပြင်ရန် {stats.pending})</span>
          </p>

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <label className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ရှာရန်"
                className="w-full rounded border border-gray-300 bg-white py-1 pl-7 pr-2 text-xs outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded border px-2 py-1 text-xs ${
                  filter === f.key
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
            <table className="w-full border-collapse whitespace-nowrap text-xs">
              <thead className="bg-gray-100 text-left dark:bg-gray-800">
                <tr>
                  <Th>Date</Th>
                  <Th>ပိုင်ရှင်နာမည်</Th>
                  <Th>Phone Model</Th>
                  <Th>ပြင်ဆင်မှုအပိုင်း</Th>
                  <Th>ပြင်ဆင်မှုအခြေအနေ</Th>
                  <Th right>ကုန်ကျစရိတ်</Th>
                  <Th>ယူပြီး ခြေနေ</Th>
                  {hasPayment && <Th>ငွေရှင်း status</Th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr key={i} className={row.done ? "" : "bg-amber-50/70 dark:bg-amber-950/20"}>
                    {/* A filtered list drops the line that held the date, so show it on every line then. */}
                    <Td muted>{filtered ? row.date : row.sheetDate}</Td>
                    <Td>{filtered ? row.owner : row.sheetOwner}</Td>
                    <Td>{row.model}</Td>
                    <Td>{row.part}</Td>
                    <Td>{row.repairStatus}</Td>
                    <Td right>{row.cost ? amount(row.cost) : ""}</Td>
                    <Td>{row.pickupStatus}</Td>
                    {hasPayment && <Td>{row.paymentStatus}</Td>}
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="p-3 text-center text-gray-500">ရှာတာနဲ့ ကိုက်တာ မရှိပါ။</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PosAd />
    </main>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`border border-gray-300 px-2 py-1 font-semibold dark:border-gray-700 ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={`border border-gray-200 px-2 py-1 dark:border-gray-800 ${right ? "text-right tabular-nums" : ""} ${muted ? "text-gray-500" : ""}`}>
      {children}
    </td>
  );
}

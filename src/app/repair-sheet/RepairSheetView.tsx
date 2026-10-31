"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, PackageCheck, Search, Smartphone, Wrench } from "lucide-react";
import type { RepairSheet, RepairSheetRow } from "@/lib/repair-sheet";
import PosAd from "./PosAd";

type Filter = "all" | "pending" | "done" | "waiting";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "အားလုံး" },
  { key: "pending", label: "ပြင်ရန် ⏳" },
  { key: "waiting", label: "ပြင်ပြီး မယူရသေး" },
  { key: "done", label: "ပြင်ပြီး ✅" },
];

const kyat = (n: number) => `${n.toLocaleString("en-US")} Ks`;

function matches(row: RepairSheetRow, filter: Filter) {
  if (filter === "pending") return !row.done;
  if (filter === "done") return row.done;
  if (filter === "waiting") return row.done && !row.pickedUp;
  return true;
}

export default function RepairSheetView({ shopName, sheet }: { shopName: string; sheet: RepairSheet | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => sheet?.rows ?? [], [sheet]);
  const stats = useMemo(() => {
    const done = rows.filter((r) => r.done);
    return {
      count: rows.length,
      total: rows.reduce((sum, r) => sum + r.cost, 0),
      done: done.length,
      pending: rows.length - done.length,
      waiting: done.filter((r) => !r.pickedUp).length,
    };
  }, [rows]);

  // Newest day first, keeping the sheet's order inside a day.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = rows.filter((r) =>
      matches(r, filter) &&
      (!q || [r.owner, r.model, r.part].some((v) => v.toLowerCase().includes(q))),
    );
    const byDate = new Map<string, RepairSheetRow[]>();
    for (const row of visible) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
    return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [rows, filter, query]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Wrench className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{shopName}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">ဖုန်းပြင်ဆင်မှု စာရင်း · Mahar Shwe Mobile · ၁ မိနစ်တိုင်း update</p>
        </div>
      </header>

      {!sheet ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Google Sheet ကို ဖတ်မရသေးပါ။ ခဏနေ ပြန်ကြည့်ပေးပါ။
        </div>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Smartphone className="size-4" />} label="ဖုန်း စုစုပေါင်း" value={stats.count} tone="blue" />
            <Stat icon={<CheckCircle2 className="size-4" />} label="ပြင်ပြီး" value={stats.done} tone="green" />
            <Stat icon={<Clock className="size-4" />} label="ပြင်ရန်" value={stats.pending} tone="amber" />
            <Stat icon={<PackageCheck className="size-4" />} label="မယူရသေး" value={stats.waiting} tone="violet" />
          </section>

          <section className="mb-5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 p-4 text-white shadow-sm">
            <p className="text-xs opacity-80">{sheet.totalLabel ?? "ငွေရှင်းရန် စုစုပေါင်း"}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{kyat(sheet.sheetTotal ?? stats.total)}</p>
          </section>

          <div className="sticky top-0 z-10 -mx-4 mb-4 space-y-3 bg-background/95 px-4 py-3 backdrop-blur">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="နာမည်၊ ဖုန်းမော်ဒယ်၊ ပြင်ဆင်မှု ရှာရန်"
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-900"
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    filter === f.key
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">ရှာတာနဲ့ ကိုက်တာ မရှိပါ။</p>
          ) : (
            <div className="space-y-5">
              {groups.map(([date, items]) => (
                <section key={date || "undated"}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{date || "ရက်စွဲ မပါ"}</h2>
                    <span className="text-xs tabular-nums text-gray-500">{kyat(items.reduce((s, r) => s + r.cost, 0))}</span>
                  </div>
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                    {items.map((row, i) => (
                      <li key={i} className="flex items-start gap-3 p-3 sm:p-4">
                        <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${row.done ? "bg-green-50 text-green-600 dark:bg-green-950/50" : "bg-amber-50 text-amber-600 dark:bg-amber-950/50"}`}>
                          {row.done ? <CheckCircle2 className="size-5" /> : <Clock className="size-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-medium">{row.model || "—"}</p>
                            <p className="shrink-0 font-semibold tabular-nums">{row.cost ? kyat(row.cost) : "—"}</p>
                          </div>
                          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                            {row.owner || "—"} · <span className="text-gray-700 dark:text-gray-300">{row.part || "—"}</span>
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge tone={row.done ? "green" : "amber"}>{row.repairStatus || (row.done ? "ပြင်ပြီး" : "ပြင်ရန်")}</Badge>
                            {row.pickupStatus ? <Badge tone="blue">{row.pickupStatus}</Badge> : row.done ? <Badge tone="violet">မယူရသေး</Badge> : null}
                            {row.paymentStatus && <Badge tone="gray">{row.paymentStatus}</Badge>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <PosAd />
    </main>
  );
}

const TONES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  green: "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={`mb-2 inline-flex size-7 items-center justify-center rounded-lg ${TONES[tone]}`}>{icon}</div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: keyof typeof TONES }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

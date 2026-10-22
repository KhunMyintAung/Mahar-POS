"use client";

import { useEffect, useState } from "react";

interface Stats { activeShops: number; users: number; repairs: number; products: number; updatedAt: string }
interface Shop { id: string; name: string; logo: string; location: string; businessType: string }

/** The shops using Mahar POS right now, from the same public figures the websites show.
 *  Only what a shop already shows the public: name, town, logo, kind of shop. */
export function CustomerLive() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    const load = () => {
      fetch("/api/public/stats", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.ok) setStats(d); }).catch(() => {});
      fetch("/api/public/shops/active?limit=8", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.ok) setShops(d.shops); }).catch(() => {});
    };
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const figures: [string, number | undefined][] = [
    ["Shops", stats?.activeShops], ["Users", stats?.users], ["Repairs", stats?.repairs], ["Products", stats?.products],
  ];

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-green-700 dark:text-green-400">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" /></span>
        Live now{stats && <span className="font-normal text-gray-500"> · updated {new Date(stats.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {figures.map(([label, v]) => (
          <div key={label} className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800">
            <div className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">{v === undefined ? "–" : v.toLocaleString()}</div>
            <div className="text-[11px] text-gray-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {shops.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-2.5 py-2 dark:border-gray-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-gray-100 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by our own API route
                <img src={s.logo.replace(/^https:\/\/[^/]+/, "")} alt="" className="h-full w-full object-contain" />
              ) : s.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.name}</span>
              <span className="block truncate text-xs text-gray-500">{[s.businessType, s.location].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

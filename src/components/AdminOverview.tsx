"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/components/ui";

interface Health {
  release: string; node: string; uptimeHours: number; memoryMb: number;
  db: { ok: boolean; ms: number; size: string | null };
  totals: Record<string, number>;
  integrations: { googleLogin: boolean; email: boolean; emailsLast24h: number; adminUsers: number; adminPasscode: boolean; telegramReportBots: number; googleSheetBackups: number };
  time: string;
}
interface Day { date: string; shops: number; users: number; logins: number }

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || "Failed");
  return body.data as T;
}

const Check = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
    <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", ok ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600")} />{label}</span>
    <span className="text-xs text-gray-500">{detail ?? (ok ? "On" : "Off")}</span>
  </div>
);

/** The admin overview: growth over 30 days, how the service is running, and exports. */
export function AdminOverview() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get<{ days: Day[] }>("/api/admin/growth").then((d) => setDays(d.days)).catch((e) => setError(e.message));
    get<Health>("/api/admin/health").then(setHealth).catch((e) => setError(e.message));
  }, []);

  const chart = (days ?? []).map((d) => ({ ...d, day: d.date.slice(5) }));
  const sum = (k: keyof Day) => (days ?? []).reduce((a, d) => a + (d[k] as number), 0);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 xl:col-span-3">{error}</div>}
      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 xl:col-span-2">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Last 30 days</h2>
          <span className="text-xs text-gray-500">{sum("shops")} new shops · {sum("users")} new users · {sum("logins")} sign-ins</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} width={30} />
            <Tooltip />
            <Legend />
            <Bar dataKey="shops" name="New shops" fill="#2563eb" />
            <Bar dataKey="users" name="New users" fill="#16a34a" />
            <Bar dataKey="logins" name="Sign-ins" fill="#C9950B" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-2 text-sm font-semibold">System health</h2>
        {!health ? <p className="text-sm text-gray-400">Loading…</p> : (
          <>
            <Check ok={health.db.ok} label="Database" detail={`${health.db.ms} ms · ${health.db.size ?? "?"}`} />
            <Check ok label="Server" detail={`up ${health.uptimeHours} h · ${health.memoryMb} MB · Node ${health.node}`} />
            <Check ok label="Version" detail={health.release} />
            <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
            <Check ok={health.integrations.googleLogin} label="Google login" />
            <Check ok={health.integrations.email} label="Email (Resend)" detail={health.integrations.email ? `${health.integrations.emailsLast24h} sent in 24 h` : "Off"} />
            <Check ok={health.integrations.adminUsers > 0} label="Admin accounts" detail={String(health.integrations.adminUsers)} />
            <Check ok={health.integrations.telegramReportBots > 0} label="Telegram report bots" detail={String(health.integrations.telegramReportBots)} />
            <Check ok={health.integrations.googleSheetBackups > 0} label="Google Sheet backups" detail={String(health.integrations.googleSheetBackups)} />
            <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {Object.entries(health.totals).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800"><div className="text-base font-bold tabular-nums">{v.toLocaleString()}</div><div className="capitalize text-gray-500">{k}</div></div>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/admin/export?type=shops" className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><Download size={15} className="mr-1.5" />Shops CSV</a>
          <a href="/api/admin/export?type=users" className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><Download size={15} className="mr-1.5" />Users CSV</a>
        </div>
      </section>
    </div>
  );
}

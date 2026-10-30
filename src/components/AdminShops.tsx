"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Lock, LockOpen, Search } from "lucide-react";
import { Button, ConfirmDialog, cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface Shop {
  id: string; name: string; phone: string | null; city: string | null; createdAt: string;
  owner: { name: string; email: string | null; username: string } | null;
  users: number; locked: boolean; lastLoginAt: string | null; sales: number; repairs: number;
  /** The owner has switched on "MSP for using Mahar POS" with a wallet. */
  mspOn: boolean;
}

/** Every shop on the service, for the admin: who owns it, how much it is used, and a
 *  switch to lock it (all its accounts off and signed out) or unlock it. */
export function AdminShops() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<Shop | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/shops", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || "Could not load shops");
    return body.data.shops as Shop[];
  }, []);

  useEffect(() => {
    load().then(setShops).catch((e) => setError(e instanceof Error ? e.message : "Could not load shops"));
  }, [load]);

  async function toggle(shop: Shop) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shops/${shop.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: !shop.locked }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Failed");
      setShops(await load());
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = (shops ?? []).filter((s) => !needle || [s.name, s.owner?.email, s.owner?.username, s.owner?.name, s.phone, s.city].some((v) => v?.toLowerCase().includes(needle)));

  return (
    <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
        <div>
          <h2 className="text-sm font-semibold">Shops ({shops?.length ?? "…"})</h2>
          <p className="mt-1 text-xs text-gray-500">Every business, newest first. Locking a shop switches off all its accounts and signs them out; nothing is deleted.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shop, owner, email, phone" className="min-h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
        </div>
      </header>
      {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60">
            <tr>{["Shop", "Owner", "Users", "Sales", "Repairs", "Registered", "Last login", "MSP", ""].map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {shown.map((s) => (
              <tr key={s.id} className={cn(s.locked && "bg-red-50/60 dark:bg-red-950/20")}>
                <td className="px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-500">{[s.phone, s.city].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{s.owner?.name ?? "—"}</div>
                  <div className="text-xs text-gray-500">{s.owner?.email ?? s.owner?.username ?? ""}</div>
                </td>
                <td className="px-3 py-2 tabular-nums">{s.users}</td>
                <td className="px-3 py-2 tabular-nums">{s.sales}</td>
                <td className="px-3 py-2 tabular-nums">{s.repairs}</td>
                <td className="px-3 py-2 text-xs">{fmtDateTime(s.createdAt)}</td>
                <td className="px-3 py-2 text-xs">{s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : "—"}</td>
                <td className="px-3 py-2">
                  {s.mspOn
                    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Coins size={13} />Earning</span>
                    : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant={s.locked ? "secondary" : "danger"} disabled={busy} onClick={() => setConfirm(s)}>
                    {s.locked ? <><LockOpen size={14} className="mr-1 inline" />Unlock</> : <><Lock size={14} className="mr-1 inline" />Lock</>}
                  </Button>
                </td>
              </tr>
            ))}
            {shops && shown.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No shops</td></tr>}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggle(confirm)}
        title={confirm?.locked ? "Unlock shop" : "Lock shop"}
        message={confirm ? (confirm.locked
          ? `Switch "${confirm.name}" back on? Its ${confirm.users} account(s) can sign in again.`
          : `Lock "${confirm.name}"? Its ${confirm.users} account(s) are switched off and signed out. No data is deleted.`) : ""}
        confirmLabel={confirm?.locked ? "Unlock" : "Lock"}
        danger={!confirm?.locked}
      />
    </section>
  );
}

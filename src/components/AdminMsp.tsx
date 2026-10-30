"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Search } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { fmtMsp } from "@/lib/msp";

interface Overview {
  totals: { held: string; earned: string; moved: string; withdrawn: string; fees: string; pendingOut: string; paidBeforeWallet: string; shops: number };
  chain: { address: string; msp: string; bnb: string; explorer: string } | null;
  chainError: string | null;
  shops: { id: string; name: string; walletId: string; earned: string; received: string; sent: string; withdrawn: string; balance: string }[];
  history: { id: string; at: string; kind: "REWARD" | "TRANSFER" | "WITHDRAW"; shop: string; other: string | null; amount: string; detail: string; status: string; link: string | null }[];
}

const KINDS = { REWARD: "Reward", TRANSFER: "Shop → shop", WITHDRAW: "Withdraw" } as const;

/** Admin → MSP: who holds how much in their MSP wallets, what the platform owes against the
 *  rewards wallet on chain, and every reward, send and withdrawal. */
export function AdminMsp() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | keyof typeof KINDS>("");

  useEffect(() => {
    fetch("/api/admin/msp", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error || "Could not load MSP");
        setData(body.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load MSP"));
  }, []);

  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-gray-500">Loading…</p>;

  const t = data.totals;
  // What the shops hold plus withdrawals still to send, against the MSP the rewards wallet has.
  const owed = BigInt(t.held) + BigInt(t.pendingOut);
  const short = data.chain ? owed - BigInt(data.chain.msp) : 0n;
  const needle = q.trim().toLowerCase();
  const shops = data.shops.filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.walletId.toLowerCase().includes(needle));
  const history = data.history.filter((h) => (!kind || h.kind === kind)
    && (!needle || [h.shop, h.other, h.detail].some((v) => v?.toLowerCase().includes(needle))));

  const tile = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold">MSP wallets</h2>
        <p className="mt-1 text-xs text-gray-500">Balances live in Mahar POS; only withdrawals go on chain, from the rewards wallet.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tile("Held by shops", `${fmtMsp(t.held)} MSP`, `${t.shops} shop(s)`, "text-amber-600")}
          {tile("Earned (rewards)", `${fmtMsp(t.earned)} MSP`)}
          {tile("Withdrawn to chain", `${fmtMsp(t.withdrawn)} MSP`, t.pendingOut !== "0" ? `${fmtMsp(t.pendingOut)} still to send` : undefined)}
          {tile("Fees kept", `${fmtMsp(t.fees)} MSP`)}
        </div>
        <div className={cn("mt-3 rounded-lg p-3 text-sm", short > 0n ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200" : "bg-gray-50 dark:bg-gray-800/60")}>
          {data.chain ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">Rewards wallet</span>
              <a href={`${data.chain.explorer}/address/${data.chain.address}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline">
                {data.chain.address.slice(0, 8)}…{data.chain.address.slice(-6)}<ExternalLink size={11} />
              </a>
              <span className="tabular-nums">{fmtMsp(data.chain.msp)} MSP</span>
              <span className="tabular-nums">{data.chain.bnb} BNB</span>
              {short > 0n && <span className="inline-flex items-center gap-1 font-medium"><AlertTriangle size={14} />{fmtMsp(short)} MSP short of what shops hold</span>}
            </div>
          ) : (
            <span className="text-gray-500">Rewards wallet: {data.chainError ?? "MSP is not set up on this server"}</span>
          )}
        </div>
      </section>

      <div className="relative w-full sm:w-80">
        <Search size={15} className="pointer-events-none absolute left-3 top-3 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shop, wallet ID, address"
          className="min-h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
      </div>

      <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <h3 className="border-b border-gray-200 p-4 text-sm font-semibold dark:border-gray-800">Who holds how much</h3>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60">
              <tr>{["Shop", "Wallet ID", "Earned", "Received", "Sent", "Withdrawn", "Balance"].map((h, i) => <th key={h} className={cn("px-3 py-2 font-medium", i > 1 && "text-right")}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {shops.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.walletId}</td>
                  {[s.earned, s.received, s.sent, s.withdrawn].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{fmtMsp(v)}</td>)}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-600">{fmtMsp(s.balance)}</td>
                </tr>
              ))}
              {shops.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No MSP wallets yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold">History ({history.length})</h3>
          <div className="flex gap-1">
            {(["", "REWARD", "TRANSFER", "WITHDRAW"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", kind === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>
                {k ? KINDS[k] : "All"}
              </button>
            ))}
          </div>
        </header>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60">
              <tr>{["When", "Type", "Shop", "To", "MSP", "Detail", "Status"].map((h) => <th key={h} className={cn("px-3 py-2 font-medium", h === "MSP" && "text-right")}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 py-2 text-xs">{fmtDateTime(h.at)}</td>
                  <td className="px-3 py-2 text-xs">{KINDS[h.kind]}</td>
                  <td className="px-3 py-2">{h.shop}</td>
                  <td className={cn("px-3 py-2", h.kind === "WITHDRAW" && "font-mono text-xs")}>{h.other ? (h.kind === "WITHDRAW" ? `${h.other.slice(0, 8)}…${h.other.slice(-6)}` : h.other) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMsp(h.amount)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{h.detail}</td>
                  <td className="px-3 py-2 text-xs">
                    {h.link
                      ? <a href={h.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">{h.status}<ExternalLink size={11} /></a>
                      : h.status}
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Nothing yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

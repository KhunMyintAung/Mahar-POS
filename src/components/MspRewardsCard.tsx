"use client";

import { useState } from "react";
import { ExternalLink, Gift } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMsp } from "@/lib/msp";
import { Button, Card, Input, cn, useToast } from "@/components/ui";

export interface MspRewardSummary {
  inPromo: boolean; on: boolean; wallet: string | null;
  earned: string; paid: string; waiting: string; daysWorked: number;
  problem: string | null; explorer: string | null; contract: string | null;
  recent: { kind: string; day: string; amount: string; status: string; txHash: string | null; createdAt: string }[];
}

const STATUS: Record<string, string> = { PENDING: "Waiting", SENT: "On the way", PAID: "In wallet" };

/** Settings → Points for a shop in the MSP promotion: switch the reward on, give the
 *  shop's BNB Chain wallet, and see what it has earned (1 MSP to start, 0.01 MSP for
 *  every day the shop records work). */
export function MspRewardsCard({ initial, onChange }: { initial: MspRewardSummary; onChange?: (s: MspRewardSummary) => void }) {
  const { push } = useToast();
  const [summary, setSummary] = useState(initial);
  const [on, setOn] = useState(initial.on);
  const [wallet, setWallet] = useState(initial.wallet ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const next = await api<MspRewardSummary>("/api/v1/msp/rewards", { method: "PUT", body: { on, wallet: wallet.trim() } });
      setSummary(next);
      setWallet(next.wallet ?? "");
      onChange?.(next);
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const txLink = (hash: string) => (summary.explorer ? `${summary.explorer}/tx/${hash}` : null);

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Gift size={16} />MSP for using Mahar POS</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Your shop is in the Mahar Shwe Point promotion. Switch it on and you get <b>1 MSP</b> to start, then
        <b> 0.01 MSP for every day</b> you record work in Mahar POS (sales, repairs, stock, top-ups…). A day with no work earns nothing.
        The points go to your shop&apos;s own BNB Chain wallet.
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Mahar POS ကို သုံးတဲ့နေ့တိုင်း 0.01 MSP ရပါမယ်။ ပထမဆုံး ဖွင့်တာနဲ့ 1 MSP ရပါမယ်။ မသုံးတဲ့နေ့ point မဝင်ပါ။
      </p>

      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <span className="text-sm font-medium">Earn MSP for using Mahar POS</span>
          <button type="button" role="switch" aria-checked={on} onClick={() => setOn(!on)}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-5" : "left-0.5")} />
          </button>
        </label>
        <Input label="Shop's BNB Chain wallet (0x…)" value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} autoComplete="off" />
        <Button disabled={busy} onClick={save}>Save</Button>
      </div>

      <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-gray-500">Earned</div><div className="font-semibold tabular-nums">{fmtMsp(summary.earned)}</div></div>
          <div><div className="text-xs text-gray-500">In wallet</div><div className="font-semibold tabular-nums">{fmtMsp(summary.paid)}</div></div>
          <div><div className="text-xs text-gray-500">Days used</div><div className="font-semibold tabular-nums">{summary.daysWorked}</div></div>
        </div>
        {summary.problem && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {summary.problem}. Your points are kept and will be sent.
          </p>
        )}
        {summary.recent.length > 0 && (
          <ul className="divide-y divide-gray-100 text-xs dark:divide-gray-800">
            {summary.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                <span>{r.kind === "WELCOME" ? "Welcome" : r.day}</span>
                <span className="tabular-nums">+{fmtMsp(r.amount)} MSP</span>
                {r.txHash && txLink(r.txHash)
                  ? <a href={txLink(r.txHash)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">{STATUS[r.status] ?? r.status}<ExternalLink size={11} /></a>
                  : <span className="text-gray-500">{STATUS[r.status] ?? r.status}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

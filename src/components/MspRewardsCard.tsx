"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Wallet } from "lucide-react";
import { MspLogo } from "@/components/MspLogo";
import { api } from "@/lib/client";
import { fmtMsp } from "@/lib/msp";
import { Card, cn, useToast } from "@/components/ui";

export interface MspRewardSummary {
  on: boolean;
  earned: string; daysWorked: number;
  recent: { kind: string; day: string; amount: string; createdAt: string }[];
}

/** MSP's own page: what it is, its contract, and where to buy or sell it. */
export const MSP_INFO_URL = "https://token.maharpos.shop/#msp";

/** Settings → Points, for every shop: switch the MSP reward on and see what it has earned
 *  (1 MSP to start, 0.01 MSP for every day the shop records work). The points land in the
 *  shop's MSP wallet. */
export function MspRewardsCard({ initial, onChange }: { initial: MspRewardSummary; onChange?: (s: MspRewardSummary) => void }) {
  const { push } = useToast();
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const next = await api<MspRewardSummary>("/api/v1/msp/rewards", { method: "PUT", body: { on: !summary.on } });
      setSummary(next);
      onChange?.(next);
      push(next.on ? "MSP reward on" : "MSP reward off");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><MspLogo size={18} />MSP for using Mahar POS</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Every Mahar POS shop can join the Mahar Shwe Point promotion. Switch it on and you get <b>1 MSP</b> to start, then
        <b> 0.01 MSP for every day</b> you record work in Mahar POS (sales, repairs, stock, top-ups…). A day with no work earns nothing.
        The points go to your shop&apos;s MSP wallet, under Wallets.
      </p>
      <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <b>What is MSP?</b> Mahar Shwe Point (MSP) is MaharGroup&apos;s point token on BNB Chain (BEP-20). Send it to other Mahar POS
        shops free, or take it out to your own wallet (Trust Wallet, MetaMask, Binance Web3…), where it can be traded on
        PancakeSwap, so its price goes up and down.
        <br />
        <b>MSP ဆိုတာ</b> MaharGroup ကုမ္ပဏီရဲ့ BNB Chain ပေါ်က Point Token ပါ။ Mahar POS ဆိုင်အချင်းချင်း အခမဲ့ လွှဲလို့ရပြီး
        ကိုယ့် Wallet ထဲ ထုတ်ယူရင် PancakeSwap မှာ ဝယ်/ရောင်းလို့ရပါတယ်။ စျေး တက်/ကျ နိုင်ပါတယ်။
        <a href={MSP_INFO_URL} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 font-medium text-blue-700 hover:underline dark:text-blue-300">
          token.maharpos.shop — details, contract and logo <ExternalLink size={11} />
        </a>
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Mahar POS ကို သုံးတဲ့နေ့တိုင်း 0.01 MSP ရပါမယ်။ ပထမဆုံး ဖွင့်တာနဲ့ 1 MSP ရပါမယ်။ မသုံးတဲ့နေ့ point မဝင်ပါ။
      </p>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <span className="text-sm font-medium">Earn MSP for using Mahar POS</span>
        <button type="button" role="switch" aria-checked={summary.on} disabled={busy} onClick={toggle}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60", summary.on ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", summary.on ? "left-5" : "left-0.5")} />
        </button>
      </label>

      <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
        <div className="grid grid-cols-3 items-center gap-2 text-center">
          <div><div className="text-xs text-gray-500">Earned</div><div className="font-semibold tabular-nums">{fmtMsp(summary.earned)}</div></div>
          <div><div className="text-xs text-gray-500">Days used</div><div className="font-semibold tabular-nums">{summary.daysWorked}</div></div>
          <Link href="/msp-wallet" className="inline-flex items-center justify-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            <Wallet size={14} />MSP Wallet
          </Link>
        </div>
        {summary.recent.length > 0 && (
          <ul className="divide-y divide-gray-100 text-xs dark:divide-gray-800">
            {summary.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                <span>{r.kind === "WELCOME" ? "Welcome" : r.day}</span>
                <span className="tabular-nums">+{fmtMsp(r.amount)} MSP</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

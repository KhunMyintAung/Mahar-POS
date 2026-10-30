"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMsp } from "@/lib/msp";
import { cn } from "@/components/ui";
import { MSP_INFO_URL, type MspRewardSummary } from "@/components/MspRewardsCard";

interface Price { priceUsd: number; change24h: number; liquidityUsd: number; url: string }

const usd = (n: number) => (n >= 1 ? n.toFixed(2) : n.toPrecision(3));

/** A small line on the Overview for a shop earning MSP: what it has earned and MSP's price
 *  with its 24-hour rise or fall. Shown only when the shop has switched the reward on. */
export function MspOverviewCard() {
  const [rewards, setRewards] = useState<MspRewardSummary | null>(null);
  const [price, setPrice] = useState<Price | null>(null);

  useEffect(() => {
    api<MspRewardSummary>("/api/v1/msp/rewards").then((r) => {
      setRewards(r);
      if (r.on) api<{ price: Price | null }>("/api/v1/msp/price").then((p) => setPrice(p.price)).catch(() => {});
    }).catch(() => {});
  }, []);

  if (!rewards?.on) return null;
  const up = (price?.change24h ?? 0) >= 0;
  const Trend = up ? TrendingUp : TrendingDown;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
      <Link href="/settings#points" className="flex items-center gap-1.5 font-medium">
        <Coins size={15} className="text-amber-600" />
        <span className="tabular-nums">{fmtMsp(rewards.earned)} MSP</span>
        <span className="text-xs font-normal text-gray-500">earned</span>
      </Link>
      {price && (
        <a href={price.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 tabular-nums">
          <span className="text-xs text-gray-500">1 MSP</span>
          <span className="font-medium">${usd(price.priceUsd)}</span>
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", up ? "text-green-600" : "text-red-600")}>
            <Trend size={13} />{up ? "+" : ""}{price.change24h.toFixed(1)}%
          </span>
        </a>
      )}
      <a href={MSP_INFO_URL} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-600 hover:underline">What is MSP?</a>
    </div>
  );
}

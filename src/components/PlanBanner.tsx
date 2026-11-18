"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PRO_PRICE_MMK } from "@/lib/plan";
import { cn } from "@/components/ui";

/** What Pro adds over Free, in a few words for the banner. */
const PRO_LINE = "Reports, online shop, Telegram bot, billers, more than one branch and more";

/** A gentle reminder at the top of the app: on Free, invite an upgrade; while the Pro trial is
 *  near its end, remind the shop to keep it. Says nothing when there is plenty of Pro left. */
export function PlanBanner({ plan }: { plan?: { plan: "FREE" | "PRO"; proUntil: string | null; daysLeft: number } }) {
  if (!plan) return null;

  const free = plan.plan === "FREE";
  // On Pro, only speak up in the last two weeks.
  if (!free && plan.daysLeft > 14) return null;

  const price = PRO_PRICE_MMK.toLocaleString("en-US");
  return (
    <Link
      href="/settings?upgrade=1"
      className={cn(
        "no-print mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        free
          ? "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
          : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <Sparkles size={16} className="shrink-0" />
      <span className="font-medium">
        {free
          ? `You're on Free. Upgrade to Pro — ${price} Ks/month`
          : `Pro ends in ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} — ${price} Ks/month to keep it`}
      </span>
      <span className="text-xs opacity-80">{PRO_LINE}</span>
      <span className="ml-auto whitespace-nowrap font-semibold underline">Upgrade</span>
    </Link>
  );
}

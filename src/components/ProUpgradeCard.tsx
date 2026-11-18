"use client";

import { Sparkles, Check } from "lucide-react";
import { Card, CardTitle, cn } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

/** What Pro adds over Free. */
const PRO_FEATURES = [
  "Reports (profit and the detailed ones)",
  "More than one branch, with stock transfer",
  "Online shop and the Telegram customer bot / AI",
  "Top-up billers",
  "Full money tools — transfer, cash-out, credit",
  "Staff management, audit log",
  "Offline mode and pop-up notifications",
];

/** Settings → Upgrade. Shows the shop's plan, what Pro gives, the price, and how to pay (the
 *  operator's own payment details, set in the server env). Paying is done with the operator
 *  by hand; after the money comes in the operator extends the shop's Pro from the admin. */
export function ProUpgradeCard() {
  const { me } = useAuth();
  const plan = me?.plan;
  if (!plan) return null;

  const isPro = plan.plan === "PRO";
  const price = plan.priceMMK.toLocaleString("en-US");

  return (
    <div id="upgrade">
    <Card className="space-y-3 border-blue-200 dark:border-blue-900">
      <CardTitle icon={Sparkles} title="Mahar POS Pro" />

      <div className={cn("rounded-lg px-3 py-2 text-sm", isPro
        ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
        : "bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-200")}>
        {isPro
          ? <>You are on <b>Pro</b> — {plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"} left.</>
          : <>You are on <b>Free</b>. Upgrade to Pro to switch the features below back on.</>}
      </div>

      <div>
        <div className="text-2xl font-bold">{price} <span className="text-base font-medium text-gray-500">Ks / month</span></div>
        <ul className="mt-2 space-y-1 text-sm">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check size={15} className="mt-0.5 shrink-0 text-green-600" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
        <div className="mb-1 font-semibold text-blue-800 dark:text-blue-200">How to pay</div>
        {plan.paymentText
          ? <p className="whitespace-pre-wrap text-blue-900 dark:text-blue-100">{plan.paymentText}</p>
          : <p className="text-blue-900 dark:text-blue-100">{"Contact the shop that gave you Mahar POS to pay for Pro."}</p>}
        <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">{"After you pay, your Pro is turned on for you. It is added on top of the days you have left, so paying early loses nothing."}</p>
      </div>
    </Card>
    </div>
  );
}

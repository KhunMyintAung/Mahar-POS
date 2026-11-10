"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Coins } from "lucide-react";
import { Card, CardTitle, useToast, cn } from "@/components/ui";
import { CURRENCIES, type Currency } from "@/lib/currency";

const NAMES: Record<Currency, string> = { MMK: "Myanmar Kyat", USD: "US Dollar", THB: "Thai Baht" };

/** Settings → Business profile: the shop's main currency. Reports, totals and the till count
 *  in it. It can change only while nothing has been recorded, so old amounts never change
 *  their meaning. Owner only (Settings). */
export function CurrencyCard({ onSaved }: { onSaved?: () => void }) {
  const [state, setState] = useState<{ currency: Currency; canChange: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    api<{ currency: Currency; canChange: boolean }>("/api/v1/settings/currency")
      .then(setState)
      .catch((e) => push(e.message, "error"));
  }, [push]);

  async function choose(currency: Currency) {
    if (!state || busy || !state.canChange || currency === state.currency) return;
    setBusy(true);
    try {
      const next = await api<{ currency: Currency; canChange: boolean }>("/api/v1/settings/currency", { method: "PUT", body: { currency } });
      setState(next);
      push("Saved");
      onSaved?.();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <CardTitle icon={Coins} title="Main currency" />
      {!state ? <p className="text-sm text-gray-500">Loading…</p> : <>
        <div className="grid gap-2 sm:grid-cols-3">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy || !state.canChange}
              onClick={() => choose(c)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed",
                c === state.currency
                  ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950"
                  : "border-gray-300 dark:border-gray-700",
                !state.canChange && c !== state.currency && "opacity-50",
              )}
            >
              <div className="text-sm font-semibold">{c}</div>
              <div className="text-xs text-gray-500">{NAMES[c]}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          {state.canChange
            ? "Reports, totals and the till count in this currency. It can change only until the first money is recorded."
            : "Money has been recorded, so the main currency is fixed. Add a wallet in another currency to hold that money on its own."}
        </p>
      </>}
    </Card>
  );
}

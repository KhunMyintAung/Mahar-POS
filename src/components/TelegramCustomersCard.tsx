"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, CardTitle, Input, cn, useToast } from "@/components/ui";

interface CustomerSettings {
  partsHours: number; partsDays: number; partsNote: string;
  aiCustomers: boolean; pickupOnly: boolean;
  /** Whether this staff member's bot has an AI key, which the AI answers use. */
  hasAiKey: boolean;
}

function Switch({ on, label, hint, onChange }: { on: boolean; label: string; hint: string; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", on ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", on ? "left-5" : "left-0.5")} />
      </button>
    </div>
  );
}

/** Owner only: what the shop's bot tells customers. Anyone who writes to a staff member's bot,
 *  other than that staff member, is a customer: they can check a repair by its voucher and the
 *  phone number on it, ask a spare part's price, top up a game, and order from the Online Shop. */
export function TelegramCustomersCard() {
  const [cfg, setCfg] = useState<CustomerSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    api<CustomerSettings>("/api/v1/telegram/customers").then(setCfg).catch((e) => push(e.message, "error"));
  }, [push]);

  if (!cfg) return null;

  async function save() {
    if (!cfg) return;
    setBusy(true);
    try {
      const { partsHours, partsDays, partsNote, aiCustomers, pickupOnly } = cfg;
      setCfg(await api<CustomerSettings>("/api/v1/telegram/customers", { method: "PUT", body: { partsHours, partsDays, partsNote, aiCustomers, pickupOnly } }));
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const whole = (v: string, max: number) => Math.min(max, Math.max(1, Math.floor(Number(v) || 1)));

  return (
    <Card className="space-y-3">
      <CardTitle icon={Users} title="Customers on the bot" />
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Customers write to My bot above: anyone other than you who messages it is answered as a customer. No new bot or token is needed.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
        <li>Repair status: the customer types the voucher number and the last 4 digits of the phone on it, and is told when the repair is ready.</li>
        <li>Spare part prices: items in the Spare Parts category, with the selling price and whether one is in stock. Never the cost or how many are left.</li>
        <li>Orders: items shown in the Online Shop.</li>
        <li>Game top-up: Online Shop items in a Game Top-up category. The customer gives the game ID and sends the payment slip; you check the money and tap Paid, then Done.</li>
      </ul>

      <Switch on={cfg.pickupOnly} onChange={(pickupOnly) => setCfg({ ...cfg, pickupOnly })}
        label="Collect at the shop only" hint="Orders are not delivered, so the bot does not ask for an address." />
      <Switch on={cfg.aiCustomers} onChange={(aiCustomers) => setCfg({ ...cfg, aiCustomers })}
        label="Answer customers with AI" hint="Questions typed in the customer's own words are answered from your prices, stock and repairs. AI never gives discounts or confirms payments." />
      {cfg.aiCustomers && !cfg.hasAiKey && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Your bot has no AI key yet. Open your bot, tap AI and add the key. Until then the bot answers with its buttons.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="In stock: ready in (hours)" type="number" min={1} max={72} value={cfg.partsHours}
          onChange={(e) => setCfg({ ...cfg, partsHours: whole(e.target.value, 72) })} />
        <Input label="To order: ready in (days)" type="number" min={1} max={60} value={cfg.partsDays}
          onChange={(e) => setCfg({ ...cfg, partsDays: whole(e.target.value, 60) })} />
      </div>
      <Input label="Note under the prices" value={cfg.partsNote} maxLength={200} placeholder="ဈေးနှုန်းတွင် လဲခ ပါပြီး"
        onChange={(e) => setCfg({ ...cfg, partsNote: e.target.value })} />
      <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
    </Card>
  );
}

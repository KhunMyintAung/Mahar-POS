"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, CardTitle, Input, useToast } from "@/components/ui";

interface PartsSettings { partsHours: number; partsDays: number; partsNote: string }

/** Owner only: what the shop's bot tells customers. Anyone who writes to a staff member's bot,
 *  other than that staff member, is a customer: they can check a repair by its voucher and the
 *  phone number on it, ask a spare part's price, and order from the Online Shop. */
export function TelegramCustomersCard() {
  const [cfg, setCfg] = useState<PartsSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    api<PartsSettings>("/api/v1/telegram/parts").then(setCfg).catch((e) => push(e.message, "error"));
  }, [push]);

  if (!cfg) return null;

  async function save() {
    setBusy(true);
    try {
      setCfg(await api<PartsSettings>("/api/v1/telegram/parts", { method: "PUT", body: cfg }));
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
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
        <li>Repair status: the customer types the voucher number and the last 4 digits of the phone on it, and is told when the repair is ready.</li>
        <li>Spare part prices: items in the Spare Parts category, with the selling price and whether one is in stock. Never the cost or how many are left.</li>
        <li>Orders: items shown in the Online Shop.</li>
      </ul>
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

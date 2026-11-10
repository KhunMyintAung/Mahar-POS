"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Wrench } from "lucide-react";
import { Card, CardTitle, useToast, cn } from "@/components/ui";
import { DEFAULT_REPAIR_FLOW, parseRepairFlow, REPAIR_FLOW_KEY, type RepairFlow } from "@/lib/repairFlow";

const PARTS: { v: RepairFlow["parts"]; title: string; body: string }[] = [
  { v: "stock", title: "From stock", body: "Parts are bought into stock (Purchases, Bought for: Service) and picked from stock at Mark as paid. Their cost counted when bought, so Reports do not count it again." },
  { v: "job", title: "Bought per job", body: "No parts stock: the part is bought for each job and its price typed in at Mark as paid. Reports take that cost off service profit on the day the job was paid." },
];
const MONEY: { v: RepairFlow["money"]; title: string; body: string }[] = [
  { v: "job", title: "Taken on the job", body: "A deposit, Mark as paid and handing the phone back take the money into a wallet. It counts as Service income from there." },
  { v: "record", title: "Record only", body: "The job keeps the charge and shows paid, but no money goes into a wallet. Type the day's repair money as Daily Service Income, so it counts once." },
];

/** Settings → Repairs: how this shop gets its parts, which decides where their cost counts,
 *  and whether money is taken on the job or the job is a record only. Owner only (Settings). */
export function RepairFlowCard() {
  const [flow, setFlow] = useState<RepairFlow | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  useEffect(() => {
    api<{ settings: Record<string, unknown> }>(`/api/v1/settings?key=${REPAIR_FLOW_KEY}`)
      .then((d) => setFlow(parseRepairFlow(d.settings[REPAIR_FLOW_KEY] ?? DEFAULT_REPAIR_FLOW)))
      .catch((e) => push(e.message, "error"));
  }, [push]);
  async function save(next: RepairFlow) {
    if (!flow || busy || (next.parts === flow.parts && next.money === flow.money)) return;
    setBusy(true);
    try {
      await api("/api/v1/settings", { method: "PUT", body: { key: REPAIR_FLOW_KEY, value: next } });
      setFlow(next);
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  if (!flow) return null;
  const choice = (selected: boolean) =>
    cn("rounded-lg border p-3 text-left", selected ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 hover:border-gray-300 dark:border-gray-700");
  return (
    <Card className="space-y-2 p-4">
      <CardTitle icon={Wrench} title="Repair parts" />
      <div className="grid gap-2 sm:grid-cols-2">
        {PARTS.map((o) => (
          <button key={o.v} type="button" disabled={busy} onClick={() => void save({ ...flow, parts: o.v })} className={choice(flow.parts === o.v)}>
            <div className="text-sm font-semibold">{o.title}</div>
            <p className="mt-1 text-xs text-gray-500">{o.body}</p>
          </button>
        ))}
      </div>
      <div className="pt-2 text-sm font-semibold">{"Repair money"}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {MONEY.map((o) => (
          <button key={o.v} type="button" disabled={busy} onClick={() => void save({ ...flow, money: o.v })} className={choice(flow.money === o.v)}>
            <div className="text-sm font-semibold">{o.title}</div>
            <p className="mt-1 text-xs text-gray-500">{o.body}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

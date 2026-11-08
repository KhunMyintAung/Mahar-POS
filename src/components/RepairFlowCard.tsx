"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Wrench } from "lucide-react";
import { Card, CardTitle, useToast, cn } from "@/components/ui";
import { DEFAULT_REPAIR_FLOW, parseRepairFlow, REPAIR_FLOW_KEY, type RepairParts } from "@/lib/repairFlow";

const OPTIONS: { v: RepairParts; title: string; body: string }[] = [
  { v: "stock", title: "From stock", body: "Parts are bought into stock (Purchases, Bought for: Service) and picked from stock at Mark as paid. Their cost counted when bought, so Reports do not count it again." },
  { v: "job", title: "Bought per job", body: "No parts stock: the part is bought for each job and its price typed in at Mark as paid. Reports take that cost off service profit on the day the job was paid." },
];

/** Settings → Repair parts: how this shop gets its parts, which decides where their cost counts. */
export function RepairFlowCard() {
  const [parts, setParts] = useState<RepairParts | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  useEffect(() => {
    api<{ settings: Record<string, unknown> }>(`/api/v1/settings?key=${REPAIR_FLOW_KEY}`)
      .then((d) => setParts(parseRepairFlow(d.settings[REPAIR_FLOW_KEY] ?? DEFAULT_REPAIR_FLOW).parts))
      .catch((e) => push(e.message, "error"));
  }, [push]);
  async function pick(v: RepairParts) {
    if (v === parts || busy) return;
    setBusy(true);
    try {
      await api("/api/v1/settings", { method: "PUT", body: { key: REPAIR_FLOW_KEY, value: { parts: v } } });
      setParts(v);
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  if (!parts) return null;
  return (
    <Card className="space-y-2 p-4">
      <CardTitle icon={Wrench} title="Repair parts" />
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <button key={o.v} type="button" disabled={busy} onClick={() => void pick(o.v)}
            className={cn("rounded-lg border p-3 text-left", parts === o.v ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 hover:border-gray-300 dark:border-gray-700")}>
            <div className="text-sm font-semibold">{o.title}</div>
            <p className="mt-1 text-xs text-gray-500">{o.body}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

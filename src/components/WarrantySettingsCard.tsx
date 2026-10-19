"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, useToast } from "@/components/ui";
import {
  DEFAULT_WARRANTY,
  WARRANTY_SETTING,
  parseWarrantySettings,
  type WarrantyOption,
  type WarrantySettings,
} from "@/lib/warranty";

type Row = { label: string; days: string };
const toRows = (options: WarrantyOption[]): Row[] => options.map((o) => ({ label: o.label, days: String(o.days) }));
const toOptions = (rows: Row[]): WarrantyOption[] =>
  rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), days: Math.max(0, Math.floor(Number(r.days) || 0)) }));

function OptionList({ title, hint, rows, onChange }: {
  title: string; hint: string; rows: Row[]; onChange: (rows: Row[]) => void;
}) {
  const input = "min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800";
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${input} min-w-0 flex-1`}
            value={row.label}
            placeholder="1 year warranty"
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
          />
          <input
            className={`${input} w-20 text-right tabular-nums`}
            type="number"
            min={0}
            value={row.days}
            aria-label="Days"
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, days: e.target.value } : r)))}
          />
          <span className="text-xs text-gray-500">days</span>
          <button type="button" aria-label="Remove" className="p-1 text-gray-400 hover:text-red-500" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600" onClick={() => onChange([...rows, { label: "", days: "0" }])}>
        <Plus size={14} />Add option
      </button>
    </div>
  );
}

/** Settings → Phone warranty: the choices offered at the till for new and second-hand phones. */
export function WarrantySettingsCard() {
  const [newRows, setNewRows] = useState<Row[] | null>(null);
  const [secondRows, setSecondRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  function fill(s: WarrantySettings) {
    setNewRows(toRows(s.newPhone));
    setSecondRows(toRows(s.secondHand));
  }

  useEffect(() => {
    api<{ settings: Record<string, unknown> }>(`/api/v1/settings?key=${WARRANTY_SETTING}`)
      .then((d) => fill(parseWarrantySettings(d.settings[WARRANTY_SETTING])))
      .catch((e) => push(e.message, "error"));
  }, [push]);

  if (!newRows) return null;

  async function save() {
    setBusy(true);
    try {
      const value: WarrantySettings = { newPhone: toOptions(newRows ?? []), secondHand: toOptions(secondRows) };
      await api("/api/v1/settings", { method: "PUT", body: { key: WARRANTY_SETTING, value } });
      fill(value);
      push("Settings saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold">Phone warranty</h3>
      <p className="mb-3 mt-1 text-xs text-gray-500">
        Offered at the till when a phone is sold. A category with &quot;New&quot; (e.g. Phone New) uses the first list;
        one with &quot;Second&quot; or &quot;Used&quot; (e.g. Phone Second) uses the second. The first option is picked by default.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <OptionList title="New phone" hint="Category: Phone New" rows={newRows} onChange={setNewRows} />
        <OptionList title="Second-hand phone" hint="Category: Phone Second" rows={secondRows} onChange={setSecondRows} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={save}>Save warranty options</Button>
        <Button variant="secondary" disabled={busy} onClick={() => fill(DEFAULT_WARRANTY)}>Reset to default</Button>
      </div>
    </Card>
  );
}

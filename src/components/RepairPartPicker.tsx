"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { useToast } from "@/components/ui";

interface Hit {
  id: string; name: string; costPrice: string; trackSerial?: boolean; trackStock?: boolean;
  stockLevels: { branchId: string; quantity: number }[];
}

/** A spare part taken from stock for this repair: the stock goes down and the part's cost
 *  is added to the job (the stock API does both), so the repair's cost and profit are right
 *  without working it out by hand. */
export function RepairPartPicker({ jobId, branchId, onAdded }: {
  jobId: string;
  branchId?: string;
  onAdded: (cost: bigint, name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      if (term.length < 2) { setHits([]); return; }
      api<{ items: Hit[] }>(`/api/v1/items?q=${encodeURIComponent(term)}`)
        // Phones go out with their IMEI from the Items page; parts here are counted ones.
        .then((d) => setHits(d.items.filter((it) => !it.trackSerial && it.trackStock !== false).slice(0, 6)))
        .catch(() => setHits([]));
    }, term.length < 2 ? 0 : 250);
    return () => clearTimeout(t);
  }, [q]);

  const stockOf = (it: Hit) =>
    it.stockLevels.filter((l) => !branchId || l.branchId === branchId).reduce((n, l) => n + l.quantity, 0);

  async function take(it: Hit) {
    const level = it.stockLevels.find((l) => !branchId || l.branchId === branchId);
    setBusy(true);
    try {
      await api("/api/v1/stock", {
        method: "POST",
        body: { itemId: it.id, branchId: branchId ?? level?.branchId, quantity: 1, reasonType: "REPAIR_USE", repairJobId: jobId },
      });
      onAdded(BigInt(it.costPrice), it.name);
      setQ("");
      setHits([]);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Part from stock (LCD, battery…)"
        aria-label="Part from stock"
        className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900"
      />
      {hits.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm dark:divide-gray-800 dark:border-gray-700">
          {hits.map((it) => {
            const left = stockOf(it);
            return (
              <li key={it.id}>
                <button type="button" disabled={busy || left <= 0} onClick={() => void take(it)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-800">
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  <span className="text-xs text-gray-500">{`${left} left`}</span>
                  <span className="w-20 text-right text-xs tabular-nums">{fmtMoney(it.costPrice)}</span>
                  <Plus size={14} className="text-blue-600" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Empty, Modal, Spinner } from "@/components/ui";

interface Entry { id: string; txnNo: string; date: string; categoryName?: string | null; description?: string | null; amount: string }
interface Row { supplierId: string; name: string; total: string; entries: Entry[] }

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date()).slice(0, 7);
const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

/** A month's expense entries added up per supplier, biggest first; tap one to see its entries. */
export function SupplierPayments({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<{ month: string; total: string; suppliers: Row[] } | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<{ month: string; total: string; suppliers: Row[] }>(`/api/v1/income-expense/suppliers?month=${month}`)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Failed"); });
    return () => { live = false; };
  }, [open, month]);

  const shown = data?.month === month ? data : null;

  return (
    <Modal open={open} onClose={onClose} title="Paid to suppliers">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex min-w-0 items-center gap-1">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={18} /></button>
            <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="min-h-9 min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
            <button type="button" aria-label="Next month" disabled={month >= thisMonth()} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"><ChevronRight size={18} /></button>
          </div>
          {shown && <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-red-600">{fmtMoney(shown.total, "MMK")}</span>}
        </div>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !shown ? (
          <Spinner />
        ) : shown.suppliers.length === 0 ? (
          <Empty message="No expenses paid to a supplier this month" />
        ) : (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
            {shown.suppliers.map((s) => (
              <div key={s.supplierId}>
                <button type="button" aria-expanded={openId === s.supplierId} onClick={() => setOpenId((id) => (id === s.supplierId ? null : s.supplierId))}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-xs text-gray-500">{`${s.entries.length} payments`}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtMoney(s.total)}</span>
                </button>
                {openId === s.supplierId && (
                  <div className="space-y-1 bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/40">
                    {s.entries.map((e) => (
                      <div key={e.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate text-gray-600 dark:text-gray-300">
                          {e.date} · {e.categoryName}{e.description ? ` · ${e.description}` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums">{fmtMoney(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { duplicateImei, splitImeis } from "@/lib/imeiInput";
import { Button, Modal, cn, useToast } from "@/components/ui";

export interface ImeiUnit {
  id: string; imei: string; status: "IN_STOCK" | "SOLD" | "REMOVED"; itemId: string; itemName: string; sku: string;
  branchId: string; receivedAt: string; soldAt?: string | null; notes?: string | null;
  sale: { txnNo: string; date: string; customer: string | null } | null;
  purchase: { txnNo: string; date: string } | null;
}

const STATUS_LABEL: Record<ImeiUnit["status"], string> = { IN_STOCK: "In stock", SOLD: "Sold", REMOVED: "Removed" };
const STATUS_TONE: Record<ImeiUnit["status"], string> = {
  IN_STOCK: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  SOLD: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  REMOVED: "bg-gray-100 text-gray-500 dark:bg-gray-800",
};

function StatusTag({ status }: { status: ImeiUnit["status"] }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", STATUS_TONE[status])}>{STATUS_LABEL[status]}</span>;
}

/** Where a unit is now, in a line. */
function whereNow(u: ImeiUnit): string {
  if (u.status === "SOLD" && u.sale) return `${u.sale.txnNo}${u.sale.customer ? ` · ${u.sale.customer}` : ""} · ${u.sale.date}`;
  if (u.status === "REMOVED") return u.notes ?? "";
  return u.purchase ? `${u.purchase.txnNo} · ${u.purchase.date}` : (u.notes ?? fmtDateTime(u.receivedAt));
}

/** Every IMEI of one item, and a box to record IMEIs for phones already counted in stock. */
export function ImeiListModal({ item, branchId, stockQty, canAdjust, onClose, onChanged }: {
  item: { itemId: string; name: string } | null;
  branchId: string;
  stockQty: number;
  canAdjust: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [units, setUnits] = useState<ImeiUnit[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const itemId = item?.itemId;
  useEffect(() => {
    if (!itemId) return;
    let live = true;
    api<{ units: ImeiUnit[] }>(`/api/v1/serials?itemId=${itemId}`)
      .then((d) => { if (live) setUnits(d.units); })
      .catch((e) => push(e.message, "error"));
    return () => { live = false; };
  }, [itemId, push]);

  if (!item) return null;
  const inStock = (units ?? []).filter((u) => u.status === "IN_STOCK" && u.branchId === branchId).length;
  const room = Math.max(0, stockQty - inStock);
  const typed = splitImeis(text);
  const dup = duplicateImei(typed);

  async function register() {
    setBusy(true);
    try {
      await api("/api/v1/serials", { method: "POST", body: { itemId: item!.itemId, branchId, imeis: typed } });
      push(`${typed.length} IMEI(s) recorded`);
      setText("");
      const d = await api<{ units: ImeiUnit[] }>(`/api/v1/serials?itemId=${item!.itemId}`);
      setUnits(d.units);
      onChanged();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`IMEIs · ${item.name}`} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800/60"><div className="text-xs text-gray-500">In stock</div><b className="tabular-nums">{stockQty}</b></div>
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800/60"><div className="text-xs text-gray-500">With IMEI</div><b className="tabular-nums">{inStock}</b></div>
          <div className={cn("rounded-lg p-2", room > 0 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-gray-50 dark:bg-gray-800/60")}><div className="text-xs text-gray-500">Without IMEI</div><b className="tabular-nums">{room}</b></div>
        </div>

        {canAdjust && room > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-200 p-3 dark:border-amber-900">
            <div className="text-sm font-medium">Record IMEIs for phones already in stock</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Scan or type IMEIs, one per line"
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={cn(typed.length > room || dup ? "text-red-600" : "text-gray-500")}>
                {dup ? `IMEI ${dup} is entered twice` : `${typed.length} of ${room} entered`}
              </span>
              <Button size="sm" disabled={busy || typed.length === 0 || typed.length > room || Boolean(dup)} onClick={register}>Record</Button>
            </div>
          </div>
        )}

        {units === null ? <p className="text-sm text-gray-500">Loading…</p> : units.length === 0 ? (
          <p className="text-sm text-gray-500">No IMEIs recorded for this item yet.</p>
        ) : (
          <div className="max-h-[45vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
            {units.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono">{u.imei}</span>
                <StatusTag status={u.status} />
                <span className="ml-auto text-xs text-gray-500">{whereNow(u)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Phones whose IMEI matches what is typed in the stock search (4 digits or more, the
 *  whole IMEI or its last digits): which model, in stock or sold, to whom. Shows nothing
 *  for a name or SKU search. */
export function ImeiMatches({ query }: { query: string }) {
  const needle = query.replace(/[\s-]/g, "");
  const isImei = /^\d{4,20}$/.test(needle);
  const [found, setFound] = useState<{ needle: string; units: ImeiUnit[] } | null>(null);

  useEffect(() => {
    if (!isImei) return;
    // Waits for a pause in typing, so a scan or a typed IMEI is looked up once.
    const timer = window.setTimeout(() => {
      api<{ units: ImeiUnit[] }>(`/api/v1/serials?q=${encodeURIComponent(needle)}`)
        .then((d) => setFound({ needle, units: d.units }))
        .catch(() => setFound({ needle, units: [] }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [needle, isImei]);

  if (!isImei || !found || found.needle !== needle || found.units.length === 0) return null;
  return (
    <div className="divide-y divide-gray-100 rounded-lg border border-blue-200 bg-blue-50/40 dark:divide-gray-800 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">IMEI match</div>
      {found.units.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="font-mono">{u.imei}</span>
          <span className="font-medium">{u.itemName}</span>
          <StatusTag status={u.status} />
          <span className="ml-auto text-xs text-gray-500">{whereNow(u)}</span>
        </div>
      ))}
    </div>
  );
}

/** The IMEI part of a stock adjustment for a tracked phone: new IMEIs coming in, or a pick
 *  of in-stock IMEIs going out. Reports the chosen list; the count is the quantity. */
export function ImeiAdjustFields({ itemId, branchId, direction, value, onChange }: {
  itemId: string;
  branchId: string;
  direction: "in" | "out";
  value: string[];
  onChange: (imeis: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [inStock, setInStock] = useState<string[] | null>(null);

  useEffect(() => {
    if (direction !== "out") return;
    let live = true;
    api<{ units: ImeiUnit[] }>(`/api/v1/serials?itemId=${itemId}&branchId=${branchId}&status=IN_STOCK`)
      .then((d) => { if (live) setInStock(d.units.map((u) => u.imei)); })
      .catch(() => { if (live) setInStock([]); });
    return () => { live = false; };
  }, [itemId, branchId, direction]);

  if (direction === "in") {
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium">IMEIs of the phones coming in</span>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); onChange(splitImeis(e.target.value)); }}
          rows={3}
          placeholder="Scan or type IMEIs, one per line"
          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <span className="text-xs text-gray-500">{value.length} phone(s)</span>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">Which phones?</span>
      {inStock === null ? <p className="text-xs text-gray-500">Loading…</p> : inStock.length === 0 ? (
        <p className="text-xs text-amber-700">No IMEIs recorded in stock here. Record them first with the IMEIs button.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
          {inStock.map((imei) => (
            <label key={imei} className="flex items-center gap-2 font-mono text-sm">
              <input
                type="checkbox"
                checked={value.includes(imei)}
                onChange={(e) => onChange(e.target.checked ? [...value, imei] : value.filter((x) => x !== imei))}
              />
              {imei}
            </label>
          ))}
        </div>
      )}
      <span className="text-xs text-gray-500">{value.length} phone(s) selected</span>
    </div>
  );
}

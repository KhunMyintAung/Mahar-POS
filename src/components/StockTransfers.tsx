"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Badge, Button, Card, Empty, Input, Modal, Select, cn, useToast } from "@/components/ui";
import { ImeiAdjustFields } from "@/components/ImeiTools";
import { useAuth } from "@/components/AppShell";
import type { StockLevel } from "@/components/StockTools";

/** Stock sent between branches: the month's transfer vouchers, a new one, and cancelling one. */

interface TransferLine { itemId: string; name: string; sku: string; quantity: number; unitCost: string; imeis: string[] }
interface Transfer {
  id: string; txnNo: string; date: string; status: string; notes?: string | null; cancelReason?: string | null;
  fromBranchId: string; toBranchId: string; fromBranch: string; toBranch: string; createdBy: string; lines: TransferLine[];
}
interface Branch { id: string; name: string }
interface DraftLine { item: StockLevel; quantity: string; imeis: string[] }

const thisMonth = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
function shiftMonth(month: string, step: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7);
}

export function StockTransfers() {
  const { hasPerm, branches: myBranches, defaultBranchId } = useAuth();
  const { push } = useToast();
  const canSend = hasPerm("stock.adjust") && hasPerm("item.manage");
  const seeCost = hasPerm("report.view") || hasPerm("item.manage");
  const [month, setMonth] = useState(thisMonth);
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [cancelFor, setCancelFor] = useState<Transfer | null>(null);

  const load = useCallback(() => {
    api<{ transfers: Transfer[]; branches: Branch[] }>(`/api/v1/stock-transfers?month=${month}`)
      .then((d) => { setTransfers(d.transfers); setBranches(d.branches); })
      .catch((e) => push(e.message, "error"));
  }, [month, push]);
  useEffect(load, [load]);

  const valueOf = (t: Transfer) => t.lines.reduce((n, l) => n + BigInt(l.unitCost) * BigInt(l.quantity), 0n);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></Button>
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
            className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <Button size="sm" variant="ghost" aria-label="Next" disabled={month >= thisMonth()} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16} /></Button>
        </div>
        {canSend && branches.length > 1 && (
          <Button className="ml-auto" onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New branch transfer</Button>
        )}
      </div>

      {branches.length < 2 && transfers?.length === 0 && (
        <Card><p className="text-sm text-gray-500">{"Stock moves between branches once the shop has two or more. Add a branch in Settings."}</p></Card>
      )}
      {transfers === null ? null : transfers.length === 0 ? (branches.length > 1 && <Card><Empty message="No transfers this month" /></Card>) : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <Card key={t.id} className={cn("space-y-2", t.status === "CANCELLED" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.txnNo}</span>
                <span className="text-sm tabular-nums text-gray-500">{t.date}</span>
                {t.status === "CANCELLED" && <Badge status="CANCELLED" />}
                <span className="flex items-center gap-1 text-sm font-medium">
                  <span>{t.fromBranch}</span><ArrowRight size={14} className="text-gray-400" /><span>{t.toBranch}</span>
                </span>
                {seeCost && <span className="ml-auto text-sm tabular-nums">{fmtMoney(valueOf(t).toString(), "MMK")}</span>}
              </div>
              <ul className="space-y-0.5 text-sm">
                {t.lines.map((l) => (
                  <li key={l.itemId} className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="tabular-nums font-medium">× {l.quantity}</span>
                    {l.imeis.length > 0 && <span className="hidden font-mono text-xs text-gray-500 sm:inline">{l.imeis.join(", ")}</span>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{t.createdBy}</span>
                {t.notes && <span>· {t.notes}</span>}
                {t.cancelReason && <span>· <span>{"Cancelled:"}</span> {t.cancelReason}</span>}
                {canSend && t.status === "COMPLETED" && (
                  <button type="button" onClick={() => setCancelFor(t)} className="ml-auto font-medium text-red-600">Cancel transfer</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && (
        <NewTransfer
          branches={branches}
          fromChoices={myBranches.filter((b) => branches.some((x) => x.id === b.id))}
          defaultFrom={defaultBranchId}
          onClose={() => setShowNew(false)}
          onDone={(no) => { setShowNew(false); push(`${no} sent`); setMonth(thisMonth()); load(); }}
        />
      )}
      {cancelFor && <CancelTransfer transfer={cancelFor} onClose={() => setCancelFor(null)} onDone={() => { setCancelFor(null); load(); }} />}
    </div>
  );
}

function NewTransfer({ branches, fromChoices, defaultFrom, onClose, onDone }: {
  branches: Branch[]; fromChoices: Branch[]; defaultFrom?: string | null; onClose: () => void; onDone: (txnNo: string) => void;
}) {
  const { push } = useToast();
  const [fromId, setFromId] = useState(() => fromChoices.find((b) => b.id === defaultFrom)?.id ?? fromChoices[0]?.id ?? "");
  const [toId, setToId] = useState(() => branches.find((b) => b.id !== (fromChoices.find((x) => x.id === defaultFrom)?.id ?? fromChoices[0]?.id))?.id ?? "");
  const [notes, setNotes] = useState("");
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<StockLevel[]>("/api/v1/stock").then(setStock).catch(() => {}); }, []);
  const onHand = (it: StockLevel) => it.byBranch.find((b) => b.branchId === fromId)?.quantity ?? 0;

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return stock
      .filter((it) => !lines.some((l) => l.item.itemId === it.itemId))
      .filter((it) => `${it.name} ${it.sku}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [q, stock, lines]);

  function changeFrom(id: string) {
    setFromId(id);
    setLines([]);
    if (id === toId) setToId(branches.find((b) => b.id !== id)?.id ?? "");
  }
  const qtyOf = (l: DraftLine) => (l.item.trackSerial ? l.imeis.length : parseInt(l.quantity) || 0);
  const problem = !fromId || !toId ? "Choose both branches"
    : fromId === toId ? "Choose two different branches"
    : lines.length === 0 ? "Add at least one item"
    : lines.find((l) => qtyOf(l) <= 0) ? "Enter how many of each"
    : lines.find((l) => qtyOf(l) > onHand(l.item)) ? `Not enough ${lines.find((l) => qtyOf(l) > onHand(l.item))!.item.name} in the sending branch`
    : null;

  async function send() {
    if (problem) return;
    setBusy(true);
    try {
      const r = await api<{ txnNo: string }>("/api/v1/stock-transfers", {
        method: "POST",
        body: {
          fromBranchId: fromId, toBranchId: toId, notes: notes.trim() || undefined,
          lines: lines.map((l) => ({ itemId: l.item.itemId, quantity: qtyOf(l), imeis: l.item.trackSerial ? l.imeis : undefined })),
        },
      });
      onDone(r.txnNo);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="New stock transfer"
      footer={
        <div className="flex items-center justify-end gap-2">
          {problem && lines.length > 0 && <span className="mr-auto text-xs text-red-600">{problem}</span>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={busy || Boolean(problem)}>{busy ? "Sending…" : "Send"}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select label="From branch" value={fromId} onChange={(e) => changeFrom(e.target.value)}>
            {fromChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select label="To branch" value={toId} onChange={(e) => setToId(e.target.value)}>
            {branches.filter((b) => b.id !== fromId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>

        <div className="relative">
          <Input label="Add item" value={q} placeholder="Search name or SKU…" onChange={(e) => setQ(e.target.value)} />
          {found.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
              {found.map((it) => (
                <button
                  key={it.itemId}
                  type="button"
                  disabled={onHand(it) <= 0}
                  onClick={() => { setLines([...lines, { item: it, quantity: "1", imeis: [] }]); setQ(""); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-gray-800"
                >
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  <span className="text-xs tabular-nums text-gray-500"><span>{"Here:"}</span> {onHand(it)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.item.itemId} className="space-y-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.item.name}</span>
                  <span className="text-xs tabular-nums text-gray-500"><span>{"Here:"}</span> {onHand(l.item)}</span>
                  {!l.item.trackSerial && (
                    <input
                      aria-label="Quantity"
                      inputMode="numeric"
                      value={l.quantity}
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x)))}
                      className="h-9 w-20 rounded-lg border border-gray-300 bg-white px-2 text-right text-sm tabular-nums dark:border-gray-700 dark:bg-gray-800"
                    />
                  )}
                  <button type="button" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
                {l.item.trackSerial && (
                  <ImeiAdjustFields
                    itemId={l.item.itemId}
                    branchId={fromId}
                    direction="out"
                    value={l.imeis}
                    onChange={(imeis) => setLines((all) => all.map((x, j) => (j === i ? { ...x, imeis } : x)))}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <Input label="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

function CancelTransfer({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: () => void }) {
  const { push } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/v1/stock-transfers/${transfer.id}/cancel`, { method: "POST", body: { reason } });
      push(`${transfer.txnNo} cancelled`);
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel transfer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={cancel} disabled={busy || reason.trim().length < 3}>Cancel transfer</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          <span className="font-medium">{transfer.txnNo}</span>{" "}
          <span>{"goes back:"}</span>{" "}
          <span>{transfer.toBranch}</span> → <span>{transfer.fromBranch}</span>
        </p>
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
}

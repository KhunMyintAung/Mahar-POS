"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, History, Phone, RotateCcw, Send, Store, Trash2, UserPlus, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button, Empty, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RepairTabs } from "@/components/RepairTabs";
import { parseLines } from "@/lib/partOrderLines";

/** The order list (အမှာစာရင်း), in the steps the shop works in:
 *   မှာရန်  — parts to get, typed or pasted the way they go to a supplier ("Vivo Y17s TL 3");
 *   မှာပြီး — sent to a supplier, listed under that supplier until they come;
 *   ရပြီ   — in; they leave the list (kept under ရပြီးသား).
 *  A supplier without a part sends it back to မှာရန်, with a note of where it was tried, so it
 *  goes with the list to the next supplier. */

interface PartOrder {
  id: string; item: string; quantity: number; price: string;
  customerName: string | null; customerPhone: string | null; deposit: string; note: string | null;
  status: "TODO" | "ORDERED" | "RECEIVED"; supplier: string | null; orderedAt: string | null;
  createdAt: string; updatedAt: string;
}

const input = "min-h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
const asText = (list: PartOrder[]) => list.map((o) => `${o.item} ${o.quantity}`).join("\n");
const daysFrom = (iso: string | null, now: number) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000)) : 0);

export default function PartOrdersPage() {
  const [orders, setOrders] = useState<PartOrder[] | null>(null);
  const [open, setOpen] = useState(0);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [history, setHistory] = useState(false);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<{ item: string; quantity: number }[]>([]);
  const [who, setWho] = useState<{ customerName: string; customerPhone: string; deposit: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sendTo, setSendTo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const canAdd = hasPerm("repair.create");
  const canEdit = hasPerm("repair.update");

  const load = useCallback(() => {
    api<{ orders: PartOrder[]; open: number; suppliers: string[] }>(`/api/v1/part-orders${history ? "?done=1" : ""}`)
      .then((d) => {
        setOrders(d.orders);
        setOpen(d.open);
        setSuppliers(d.suppliers);
        setNow(Date.now());
        // Everything still to order is ticked to send; untick what this supplier is not for.
        setPicked(new Set(d.orders.filter((o) => o.status === "TODO").map((o) => o.id)));
      })
      .catch((e) => push(e.message, "error"));
  }, [history, push]);
  useEffect(load, [load]);

  const copy = (list: PartOrder[], label: string) =>
    navigator.clipboard?.writeText(asText(list)).then(() => push(label)).catch(() => push("Could not copy", "error"));

  async function add() {
    if (!lines.length) return;
    setBusy(true);
    try {
      await api("/api/v1/part-orders", {
        method: "POST",
        body: { lines, customerName: who?.customerName || undefined, customerPhone: who?.customerPhone || undefined, deposit: who?.deposit.replace(/,/g, "") || "0" },
      });
      push(lines.length === 1 ? "Added" : `${lines.length} added`);
      setText(""); setLines([]); setWho(null);
      if (history) setHistory(false); else load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const supplier = sendTo?.trim();
    const list = (orders ?? []).filter((o) => o.status === "TODO" && picked.has(o.id));
    if (!supplier || !list.length) return;
    setBusy(true);
    try {
      await api("/api/v1/part-orders/send", { method: "POST", body: { ids: list.map((o) => o.id), supplier } });
      await copy(list, `Sent ${list.length} to ${supplier} — list copied`);
      setSendTo(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function change(order: PartOrder, body: Record<string, unknown>, message?: string) {
    try {
      await api(`/api/v1/part-orders/${order.id}`, { method: "PATCH", body });
      if (message) push(message);
      load();
      return true;
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
      return false;
    }
  }

  /** The supplier did not have it: back to "to order", with a note of where it was tried. */
  const notThere = (o: PartOrder) =>
    change(o, {
      status: "TODO", supplier: "",
      note: [o.note, `${fmtDate(new Date())}: ✗ ${o.supplier ?? "—"}`].filter(Boolean).join("\n"),
    }, `${o.item} — back to order`);

  async function remove(order: PartOrder) {
    if (!window.confirm(`Delete "${order.item}"?`)) return;
    try {
      await api(`/api/v1/part-orders/${order.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const all = orders ?? [];
  const todo = all.filter((o) => o.status === "TODO");
  const ordered = all.filter((o) => o.status === "ORDERED");
  const bySupplier = [...new Set(ordered.map((o) => o.supplier ?? "—"))].map((s) => ({ supplier: s, list: ordered.filter((o) => (o.supplier ?? "—") === s) }));
  const pickedCount = todo.filter((o) => picked.has(o.id)).length;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const row = (o: PartOrder, lead: React.ReactNode, trail?: React.ReactNode) => (
    <OrderRow key={o.id} order={o} now={now} open={expanded === o.id} canEdit={canEdit} lead={lead} trail={trail}
      onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
      onChange={(body, message) => change(o, body, message)} onDelete={() => remove(o)} />
  );

  return (
    <div className="mx-auto max-w-4xl space-y-2.5">
      <PageHeader title={<RepairTabs openOrders={open} />}>
        <button type="button" onClick={() => setHistory((h) => !h)} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {history ? <><X size={13} />Close</> : <><History size={13} />Received</>}
        </button>
      </PageHeader>

      {history ? (
        !orders ? <Spinner /> : all.length === 0 ? <Empty message="Nothing received yet" /> : (
          <Section title={`Received · ${all.length}`}>
            {all.map((o) => row(o, <Check size={18} className="shrink-0 text-green-600" />,
              canEdit && <button type="button" onClick={() => change(o, { status: o.supplier ? "ORDERED" : "TODO" }, "Opened again")} className="shrink-0 rounded-md p-1 text-gray-400 hover:text-blue-600" title="Undo — not received" aria-label="Undo"><RotateCcw size={15} /></button>))}
          </Section>
        )
      ) : (
        <>
          {canAdd && (
            <div className="rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setLines(parseLines(e.target.value)); }}
                rows={lines.length > 1 ? 2 : 1}
                placeholder="Part and count (Vivo Y17s TL 3) — or paste a whole list"
                className={cn(input, "w-full resize-none py-2 text-base sm:text-sm")}
              />
              {lines.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                    {lines.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1">
                        <input value={l.item} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                        <span className="text-xs text-gray-400">×</span>
                        <input value={l.quantity} inputMode="numeric" aria-label="Quantity"
                          onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 1)) } : x)))}
                          className="w-10 rounded border border-gray-200 bg-transparent text-center text-sm tabular-nums dark:border-gray-700" />
                      </div>
                    ))}
                  </div>
                  {who && (
                    <div className="grid grid-cols-3 gap-1.5">
                      <input value={who.customerName} onChange={(e) => setWho({ ...who, customerName: e.target.value })} placeholder="Customer" className={input} />
                      <input value={who.customerPhone} onChange={(e) => setWho({ ...who, customerPhone: e.target.value })} placeholder="Phone" inputMode="tel" className={input} />
                      <input value={who.deposit} onChange={(e) => setWho({ ...who, deposit: e.target.value })} placeholder="Deposit" inputMode="decimal" className={input} />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {!who && <button type="button" onClick={() => setWho({ customerName: "", customerPhone: "", deposit: "" })} className="flex items-center gap-1 text-xs font-medium text-blue-600"><UserPlus size={14} />Customer / deposit</button>}
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => { setText(""); setLines([]); setWho(null); }}>Cancel</Button>
                    <Button size="sm" disabled={busy} onClick={add}>{lines.length === 1 ? "Add" : `Add ${lines.length}`}</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!orders ? <Spinner /> : todo.length + ordered.length === 0 ? <Empty message="Nothing to order" /> : (
            <>
              {/* Step 1: to order. Tick what goes to one supplier, then send. */}
              {todo.length > 0 && (
                <Section
                  title={`To order · ${todo.length}`}
                  tone="amber"
                  action={canEdit && (
                    <div className="flex items-center gap-1.5">
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input type="checkbox" checked={pickedCount === todo.length} onChange={(e) => setPicked(e.target.checked ? new Set(todo.map((o) => o.id)) : new Set())} />
                        All
                      </label>
                      <Button size="sm" disabled={!pickedCount} onClick={() => setSendTo(sendTo === null ? "" : null)}><Send size={13} className="mr-1 inline" />{`Send to supplier (${pickedCount})`}</Button>
                    </div>
                  )}
                >
                  {sendTo !== null && (
                    <div className="flex flex-wrap items-center gap-1.5 bg-blue-50 px-2.5 py-2 dark:bg-blue-950/40">
                      <Store size={15} className="text-blue-600" />
                      <input autoFocus list="part-suppliers" value={sendTo} onChange={(e) => setSendTo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Which supplier? (Ko Aung…)" className={cn(input, "min-w-0 flex-1")} />
                      <datalist id="part-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
                      <Button size="sm" disabled={busy || !sendTo.trim()} onClick={send}>Sent + copy</Button>
                    </div>
                  )}
                  {todo.map((o) => row(o,
                    <input type="checkbox" checked={picked.has(o.id)} disabled={!canEdit} onChange={() => toggle(o.id)} className="h-4 w-4 shrink-0" aria-label={`Send ${o.item}`} />))}
                </Section>
              )}

              {/* Step 2: ordered, under each supplier, until they come. */}
              {bySupplier.map(({ supplier, list }) => (
                <Section
                  key={supplier}
                  title={<>🏪 {supplier} · <span>{`${list.length} pcs`}</span> · <span>{daysFrom(list[0].orderedAt, now) === 0 ? "today" : `${daysFrom(list[0].orderedAt, now)} days`}</span></>}
                  tone="blue"
                  action={<button type="button" onClick={() => copy(list, `${supplier} list copied`)} className="flex items-center gap-1 text-xs font-medium text-blue-600"><Copy size={13} />Copy</button>}
                >
                  {list.map((o) => row(o,
                    <button type="button" disabled={!canEdit} onClick={() => change(o, { status: "RECEIVED" }, `${o.item} — received`)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 text-transparent hover:border-green-600 hover:text-green-600 dark:border-gray-600" title="Received" aria-label={`Received ${o.item}`}><Check size={14} /></button>,
                    canEdit && <button type="button" onClick={() => notThere(o)} className="shrink-0 rounded-md border border-red-200 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:border-red-900" title="Not in stock there — back to order for the next supplier">Not in stock</button>))}
                </Section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, tone, action, children }: { title: React.ReactNode; tone?: "amber" | "blue"; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className={cn("flex items-center justify-between gap-2 px-2.5 py-1.5", tone === "amber" ? "bg-amber-50 dark:bg-amber-950/30" : tone === "blue" ? "bg-blue-50/70 dark:bg-blue-950/30" : "bg-gray-50 dark:bg-gray-800/60")}>
        <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
        {action}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </div>
  );
}

function OrderRow({ order: o, now, open, canEdit, lead, trail, onToggle, onChange, onDelete }: {
  order: PartOrder; now: number; open: boolean; canEdit: boolean; lead: React.ReactNode; trail?: React.ReactNode;
  onToggle: () => void; onChange: (body: Record<string, unknown>, message?: string) => Promise<boolean>; onDelete: () => void;
}) {
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(BigInt(o.price || "0") > 0n ? String(Number(BigInt(o.price)) / 100) : "");
  const deposit = BigInt(o.deposit || "0");
  const priced = BigInt(o.price || "0");
  const waited = daysFrom(o.createdAt, now);
  const meta = [
    o.customerName,
    deposit > 0n ? `Deposit ${fmtMoney(o.deposit)}` : "",
    o.note ? `📝 ${o.note.split("\n").pop()}` : "",
    o.status === "RECEIVED" ? [o.supplier, fmtDate(o.updatedAt)].filter(Boolean).join(" · ") : waited > 0 ? `${waited} days` : "",
  ].filter(Boolean);

  async function addNote() {
    if (!note.trim()) return;
    if (await onChange({ note: [o.note, `${fmtDate(new Date())}: ${note.trim()}`].filter(Boolean).join("\n") })) setNote("");
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {lead}
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{o.item}</span>
            {meta.length > 0 && (
              <span className={cn("block truncate text-[11px]", waited >= 3 && o.status !== "RECEIVED" ? "text-red-600" : "text-gray-500")}>
                {meta.map((m, i) => <span key={i}>{i > 0 && " · "}<span>{m}</span></span>)}
              </span>
            )}
          </span>
          {priced > 0n && <span className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300">{fmtMoney(o.price)}</span>}
          <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums dark:bg-gray-800">×{o.quantity}</span>
          <ChevronDown size={15} className={cn("shrink-0 text-gray-400 transition", open && "rotate-180")} />
        </button>
        {trail}
      </div>

      {open && (
        <div className="space-y-2 border-t border-dashed border-gray-200 px-2.5 py-2 dark:border-gray-800">
          {(o.customerName || o.customerPhone) && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {o.customerName && <span>{o.customerName}</span>}
              {o.customerPhone && <a href={`tel:${o.customerPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-blue-600"><Phone size={13} />{o.customerPhone}</a>}
              {deposit > 0n && <span className="text-xs text-blue-700 dark:text-blue-300">{`Deposit ${fmtMoney(o.deposit)}`}</span>}
            </div>
          )}
          {o.note && <p className="whitespace-pre-line rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-700 [overflow-wrap:anywhere] dark:bg-gray-800 dark:text-gray-300">{o.note}</p>}
          {canEdit && (
            <>
              <div className="flex gap-1.5">
                <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} placeholder="Note (price, supplier, when it comes…)" className={cn(input, "min-w-0 flex-1")} />
                <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={addNote}>Note</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <label className="flex items-center gap-1">Price
                  <input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => { const v = price.replace(/,/g, "") || "0"; if (v !== String(Number(priced) / 100)) onChange({ price: v }); }} inputMode="decimal" placeholder="0" className={cn(input, "w-24 text-right tabular-nums")} />
                </label>
                <label className="flex items-center gap-1">Qty
                  <input defaultValue={o.quantity} onBlur={(e) => { const q = Math.max(1, Math.min(999, Number(e.target.value) || 1)); if (q !== o.quantity) onChange({ quantity: q }); }} inputMode="numeric" className={cn(input, "w-14 text-center tabular-nums")} />
                </label>
                <span className="flex-1" />
                <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" aria-label="Delete" title="Delete"><Trash2 size={15} /></button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

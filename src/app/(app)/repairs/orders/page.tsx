"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, PackageCheck, Pencil, Phone, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button, Card, Empty, Input, Modal, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RepairTabs } from "@/components/RepairTabs";

/** The order list (အမှာစာရင်း): parts customers asked the shop to get — a screen, a battery —
 *  often with a deposit while they keep their phone. Each stays here until it is in and handed
 *  over; the note keeps where it was tried, so the next shop to ask is the next one on it. */

interface PartOrder {
  id: string; item: string; customerName: string | null; customerPhone: string | null;
  deposit: string; note: string | null; status: "WAITING" | "GOT" | "DONE"; createdAt: string;
}

const blank = { item: "", customerName: "", customerPhone: "", deposit: "", note: "" };
const field = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:text-sm";

/** Days an order has been on the list, from the day it was written down. */
function daysSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

export default function PartOrdersPage() {
  const [orders, setOrders] = useState<PartOrder[] | null>(null);
  const [open, setOpen] = useState(0);
  const [view, setView] = useState<"open" | "WAITING" | "GOT" | "done">("open");
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PartOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const canAdd = hasPerm("repair.create");
  const canEdit = hasPerm("repair.update");

  const load = useCallback(() => {
    api<{ orders: PartOrder[]; open: number }>(`/api/v1/part-orders${view === "done" ? "?done=1" : ""}`)
      .then((d) => { setOrders(d.orders); setOpen(d.open); setNow(Date.now()); })
      .catch((e) => push(e.message, "error"));
  }, [view, push]);
  useEffect(load, [load]);

  async function add() {
    if (!form.item.trim()) return push("What to order?", "error");
    setBusy(true);
    try {
      await api("/api/v1/part-orders", { method: "POST", body: { ...form, deposit: form.deposit.replace(/,/g, "") || "0" } });
      setForm(blank);
      setAdding(false);
      push("Added to the order list");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function change(order: PartOrder, body: Record<string, unknown>, message?: string) {
    setBusy(true);
    try {
      await api(`/api/v1/part-orders/${order.id}`, { method: "PATCH", body });
      if (message) push(message);
      load();
      return true;
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(order: PartOrder) {
    if (!window.confirm(`Delete "${order.item}" from the list?`)) return;
    try {
      await api(`/api/v1/part-orders/${order.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const shown = (orders ?? []).filter((o) => view === "open" || view === "done" || o.status === view);
  const waiting = (orders ?? []).filter((o) => o.status === "WAITING").length;
  const got = (orders ?? []).filter((o) => o.status === "GOT").length;
  const chips: [typeof view, string, number | null][] = [
    ["open", "မပြီးသေး", view === "done" ? null : open],
    ["WAITING", "ရရန်စောင့်", view === "done" ? null : waiting],
    ["GOT", "ရပြီ (ပေးရန်)", view === "done" ? null : got],
    ["done", "ပေးပြီးသား", null],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title={<>အမှာစာရင်း</>}>
        {canAdd && !adding && <Button size="sm" onClick={() => setAdding(true)}><Plus size={16} className="mr-1 inline" />မှာစာ အသစ်</Button>}
      </PageHeader>
      <RepairTabs openOrders={open} />

      {adding && (
        <Card className="space-y-2.5">
          <Input label="ဘာမှာမလဲ *" autoFocus value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="Redmi Note 12 မှန် / iPhone 11 ဘက်ထရီ" />
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Input label="ဝယ်သူ နာမည်" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            <Input label="ဖုန်း" value={form.customerPhone} inputMode="tel" onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            <Input label="စရံ" value={form.deposit} inputMode="decimal" onChange={(e) => setForm({ ...form, deposit: e.target.value })} placeholder="0" />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">မှတ်ချက် (ဘယ်ဆိုင်မှာ မှာမလဲ၊ စျေး…)</span>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={field} placeholder="Ko Aung ဆိုင် မေးရန်" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAdding(false); setForm(blank); }}>Cancel</Button>
            <Button disabled={busy || !form.item.trim()} onClick={add}>စာရင်းထဲထည့်</Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {chips.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium", view === key ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200")}
          >
            {label}
            {count ? <span className={cn("rounded-full px-1.5 text-xs", view === key ? "bg-white/25" : "bg-gray-100 dark:bg-gray-800")}>{count}</span> : null}
          </button>
        ))}
      </div>

      {!orders ? <Spinner /> : shown.length === 0 ? (
        <Empty message={view === "done" ? "ပေးပြီးသား မရှိသေးပါ" : "မှာထားတာ မရှိပါ။ ဝယ်သူ မှာခိုင်းတာကို \"မှာစာ အသစ်\" နဲ့ မှတ်ထားပါ"} />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {shown.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              days={daysSince(o.createdAt, now)}
              canEdit={canEdit}
              busy={busy}
              onStatus={(status, message) => change(o, { status }, message)}
              onAddNote={(text) => change(o, { note: [o.note, `${fmtDate(new Date())}: ${text}`].filter(Boolean).join("\n") })}
              onEdit={() => setEditing(o)}
              onDelete={() => remove(o)}
            />
          ))}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="မှာစာ ပြင်ရန်">
        {editing && (
          <EditOrder
            order={editing}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={async (body) => { if (await change(editing, body, "Saved")) setEditing(null); }}
          />
        )}
      </Modal>
    </div>
  );
}

function OrderCard({ order: o, days, canEdit, busy, onStatus, onAddNote, onEdit, onDelete }: {
  order: PartOrder; days: number; canEdit: boolean; busy: boolean;
  onStatus: (status: PartOrder["status"], message: string) => void;
  onAddNote: (text: string) => Promise<boolean>;
  onEdit: () => void; onDelete: () => void;
}) {
  const [note, setNote] = useState("");
  const deposit = BigInt(o.deposit || "0");
  return (
    <Card className={cn("space-y-2 p-3", o.status === "GOT" && "ring-2 ring-green-400/60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug [overflow-wrap:anywhere]">{o.item}</div>
          <div className="text-xs text-gray-500">
            {fmtDate(o.createdAt)} · {days === 0 ? "ဒီနေ့" : `${days} ရက်`}
          </div>
        </div>
        <span className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
          o.status === "WAITING" ? (days >= 3 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300")
            : o.status === "GOT" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        )}>
          {o.status === "WAITING" ? "ရရန်စောင့်" : o.status === "GOT" ? "ရပြီ · ပေးရန်" : "ပေးပြီး"}
        </span>
      </div>

      {(o.customerName || o.customerPhone || deposit > 0n) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {o.customerName && <span>{o.customerName}</span>}
          {o.customerPhone && <a href={`tel:${o.customerPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-blue-600"><Phone size={13} />{o.customerPhone}</a>}
          {deposit > 0n && <span className="rounded-md bg-blue-50 px-1.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">စရံ {fmtMoney(o.deposit)}</span>}
        </div>
      )}

      {o.note && <p className="whitespace-pre-line rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-700 [overflow-wrap:anywhere] dark:bg-gray-800 dark:text-gray-300">{o.note}</p>}

      {canEdit && o.status !== "DONE" && (
        <div className="flex gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={async (e) => { if (e.key === "Enter" && note.trim() && await onAddNote(note.trim())) setNote(""); }}
            placeholder="ဒီဆိုင်မှာ မရ / နောက်ဆိုင် မေးမယ်…"
            className="min-h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={async () => { if (await onAddNote(note.trim())) setNote(""); }}>မှတ်မည်</Button>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-gray-200 pt-2 dark:border-gray-800">
          {o.status === "WAITING" && <Button size="sm" disabled={busy} onClick={() => onStatus("GOT", "ရပြီ — ဝယ်သူကို ဖုန်းဆက်ပါ")}><Check size={14} className="mr-1 inline" />ရပြီ</Button>}
          {o.status === "GOT" && <Button size="sm" disabled={busy} onClick={() => onStatus("DONE", "ပေးပြီး")}><PackageCheck size={14} className="mr-1 inline" />ပေးပြီး</Button>}
          {o.status !== "WAITING" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("WAITING", "ပြန်စောင့်နေပါပြီ")}><RotateCcw size={14} className="mr-1 inline" />ပြန်စောင့်</Button>}
          <span className="flex-1" />
          <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800" aria-label="Edit" title="Edit"><Pencil size={15} /></button>
          <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" aria-label="Delete" title="Delete"><Trash2 size={15} /></button>
        </div>
      )}
    </Card>
  );
}

function EditOrder({ order, busy, onCancel, onSave }: {
  order: PartOrder; busy: boolean; onCancel: () => void; onSave: (body: Record<string, string>) => void;
}) {
  const [f, setF] = useState({
    item: order.item, customerName: order.customerName ?? "", customerPhone: order.customerPhone ?? "",
    deposit: String(Number(BigInt(order.deposit || "0")) / 100), note: order.note ?? "",
  });
  return (
    <div className="space-y-2.5">
      <Input label="ဘာမှာမလဲ" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Input label="ဝယ်သူ နာမည်" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} />
        <Input label="ဖုန်း" value={f.customerPhone} inputMode="tel" onChange={(e) => setF({ ...f, customerPhone: e.target.value })} />
        <Input label="စရံ" value={f.deposit} inputMode="decimal" onChange={(e) => setF({ ...f, deposit: e.target.value })} />
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">မှတ်ချက်</span>
        <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={4} className={field} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !f.item.trim()} onClick={() => onSave({ ...f, deposit: f.deposit.replace(/,/g, "") || "0" })}>Save</Button>
      </div>
    </div>
  );
}

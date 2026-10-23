"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, PackageCheck, Phone, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button, Empty, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RepairTabs } from "@/components/RepairTabs";
import { parseLines } from "@/lib/partOrderLines";

/** The order list (အမှာစာရင်း): parts the shop has to get — a screen, a battery — often for a
 *  customer who left a deposit and kept their phone. Written the way the shop sends it to a
 *  supplier, one part and its count per line ("Vivo Y17s TL 3"), so a whole list can be pasted
 *  in, and copied back out for the next supplier. Each part stays until it is in and handed
 *  over; its note keeps where it was tried. */

interface PartOrder {
  id: string; item: string; quantity: number; price: string;
  customerName: string | null; customerPhone: string | null;
  deposit: string; note: string | null; status: "WAITING" | "GOT" | "DONE"; createdAt: string;
}

const input = "min-h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

export default function PartOrdersPage() {
  const [orders, setOrders] = useState<PartOrder[] | null>(null);
  const [open, setOpen] = useState(0);
  const [view, setView] = useState<"open" | "WAITING" | "GOT" | "done">("open");
  const [text, setText] = useState("");
  const [lines, setLines] = useState<{ item: string; quantity: number }[]>([]);
  const [who, setWho] = useState<{ customerName: string; customerPhone: string; deposit: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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

  function typed(value: string) {
    setText(value);
    setLines(parseLines(value));
  }

  async function add() {
    if (!lines.length) return;
    setBusy(true);
    try {
      await api("/api/v1/part-orders", {
        method: "POST",
        body: {
          lines,
          customerName: who?.customerName || undefined,
          customerPhone: who?.customerPhone || undefined,
          deposit: who?.deposit.replace(/,/g, "") || "0",
        },
      });
      push(lines.length === 1 ? "Added" : `${lines.length} added`);
      setText("");
      setLines([]);
      setWho(null);
      if (view === "done") setView("open"); else load();
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
  const shown = all.filter((o) => view === "open" || view === "done" || o.status === view);
  const waiting = all.filter((o) => o.status === "WAITING");
  const got = all.filter((o) => o.status === "GOT").length;

  /** The parts still to get, in the shop's own order format, for the next supplier. */
  function copyList() {
    const list = waiting.map((o) => `${o.item} ${o.quantity}`).join("\n");
    navigator.clipboard?.writeText(list).then(() => push(`${waiting.length} lines copied`)).catch(() => push("Could not copy", "error"));
  }

  const chips: [typeof view, string, number | null][] = [
    ["open", "မပြီးသေး", view === "done" ? null : open],
    ["WAITING", "ရရန်", view === "done" ? null : waiting.length],
    ["GOT", "ရပြီ", view === "done" ? null : got],
    ["done", "ပေးပြီးသား", null],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-2.5">
      <PageHeader title={<>အမှာစာရင်း</>} />
      <RepairTabs openOrders={open} />

      {/* Add: type or paste the list, one part per line. */}
      {canAdd && (
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
          <textarea
            value={text}
            onChange={(e) => typed(e.target.value)}
            // Once read, the list below is what to check, so the box itself stays small.
            rows={lines.length > 1 ? 2 : 1}
            placeholder={"မှာမည့်ပစ္စည်း + အရေအတွက် (ဥပမာ Vivo Y17s TL 3) — စာရင်းလိုက် Paste လည်းရ"}
            className={cn(input, "w-full resize-none py-2 text-base sm:text-sm")}
          />
          {lines.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1">
                    <input value={l.item} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      value={l.quantity}
                      inputMode="numeric"
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 1)) } : x)))}
                      className="w-10 rounded border border-gray-200 bg-transparent text-center text-sm tabular-nums dark:border-gray-700"
                      aria-label="Quantity"
                    />
                  </div>
                ))}
              </div>
              {who && (
                <div className="grid grid-cols-3 gap-1.5">
                  <input value={who.customerName} onChange={(e) => setWho({ ...who, customerName: e.target.value })} placeholder="ဝယ်သူ" className={input} />
                  <input value={who.customerPhone} onChange={(e) => setWho({ ...who, customerPhone: e.target.value })} placeholder="ဖုန်း" inputMode="tel" className={input} />
                  <input value={who.deposit} onChange={(e) => setWho({ ...who, deposit: e.target.value })} placeholder="စရံ" inputMode="decimal" className={input} />
                </div>
              )}
              <div className="flex items-center gap-2">
                {!who && (
                  <button type="button" onClick={() => setWho({ customerName: "", customerPhone: "", deposit: "" })} className="flex items-center gap-1 text-xs font-medium text-blue-600">
                    <UserPlus size={14} />ဝယ်သူ / စရံ
                  </button>
                )}
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => { setText(""); setLines([]); setWho(null); }}>Cancel</Button>
                <Button size="sm" disabled={busy} onClick={add}>{lines.length === 1 ? "ထည့်မည်" : `${lines.length} ခု ထည့်မည်`}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters, and the list for the next supplier. */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {chips.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn("flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium", view === key ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200")}
          >
            {label}
            {count ? <span className={cn("rounded-full px-1.5", view === key ? "bg-white/25" : "bg-gray-100 dark:bg-gray-800")}>{count}</span> : null}
          </button>
        ))}
        <span className="flex-1" />
        {view !== "done" && waiting.length > 0 && (
          <button type="button" onClick={copyList} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" title="Copy the parts still to get, to send to a supplier">
            <Copy size={13} />Copy စာရင်း
          </button>
        )}
      </div>

      {!orders ? <Spinner /> : shown.length === 0 ? (
        <Empty message={view === "done" ? "ပေးပြီးသား မရှိသေးပါ" : "မှာစရာ မရှိပါ"} />
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {shown.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              days={Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 86_400_000))}
              open={expanded === o.id}
              canEdit={canEdit}
              onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
              onChange={(body, message) => change(o, body, message)}
              onDelete={() => remove(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order: o, days, open, canEdit, onToggle, onChange, onDelete }: {
  order: PartOrder; days: number; open: boolean; canEdit: boolean;
  onToggle: () => void;
  onChange: (body: Record<string, unknown>, message?: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(BigInt(o.price || "0") > 0n ? String(Number(BigInt(o.price)) / 100) : "");
  const deposit = BigInt(o.deposit || "0");
  const priced = BigInt(o.price || "0");
  const late = o.status === "WAITING" && days >= 3;

  async function addNote() {
    if (!note.trim()) return;
    if (await onChange({ note: [o.note, `${fmtDate(new Date())}: ${note.trim()}`].filter(Boolean).join("\n") })) setNote("");
  }

  return (
    <div className={cn(o.status === "GOT" && "bg-green-50/60 dark:bg-green-950/20")}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* The tick: still to get → got it. */}
        {o.status === "DONE" ? (
          <PackageCheck size={20} className="shrink-0 text-gray-400" />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onChange({ status: o.status === "WAITING" ? "GOT" : "WAITING" }, o.status === "WAITING" ? "ရပြီ" : undefined)}
            className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", o.status === "GOT" ? "border-green-600 bg-green-600 text-white" : late ? "border-red-400" : "border-gray-300 dark:border-gray-600")}
            aria-label={o.status === "WAITING" ? "Got it" : "Not got yet"}
            title={o.status === "WAITING" ? "ရပြီ" : "ပြန်စောင့်"}
          >
            {o.status === "GOT" && <Check size={14} />}
          </button>
        )}
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-medium", o.status === "DONE" && "text-gray-500")}>{o.item}</span>
            <span className="block truncate text-[11px] text-gray-500">
              {[o.customerName, deposit > 0n ? `စရံ ${fmtMoney(o.deposit)}` : "", o.note ? "📝" : "", days > 0 && o.status !== "DONE" ? `${days} ရက်` : fmtDate(o.createdAt)].filter(Boolean).join(" · ")}
            </span>
          </span>
          {priced > 0n && <span className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300">{fmtMoney(o.price)}</span>}
          <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums dark:bg-gray-800">×{o.quantity}</span>
          <ChevronDown size={16} className={cn("shrink-0 text-gray-400 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-dashed border-gray-200 px-2.5 py-2 dark:border-gray-800">
          {(o.customerName || o.customerPhone) && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {o.customerName && <span>{o.customerName}</span>}
              {o.customerPhone && <a href={`tel:${o.customerPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-blue-600"><Phone size={13} />{o.customerPhone}</a>}
              {deposit > 0n && <span className="text-xs text-blue-700 dark:text-blue-300">စရံ {fmtMoney(o.deposit)}</span>}
            </div>
          )}
          {o.note && <p className="whitespace-pre-line rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-700 [overflow-wrap:anywhere] dark:bg-gray-800 dark:text-gray-300">{o.note}</p>}
          {canEdit && o.status !== "DONE" && (
            <>
              <div className="flex gap-1.5">
                <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} placeholder="ဒီဆိုင်မှာ မရ / နောက်ဆိုင် မေးမယ်…" className={cn(input, "min-w-0 flex-1")} />
                <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={addNote}>မှတ်မည်</Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <label className="flex items-center gap-1">
                  ဈေး
                  <input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => { const v = price.replace(/,/g, "") || "0"; if (v !== String(Number(priced) / 100)) onChange({ price: v }); }} inputMode="decimal" placeholder="0" className={cn(input, "w-24 text-right tabular-nums")} />
                </label>
                <label className="flex items-center gap-1">
                  အရေအတွက်
                  <input defaultValue={o.quantity} onBlur={(e) => { const q = Math.max(1, Math.min(999, Number(e.target.value) || 1)); if (q !== o.quantity) onChange({ quantity: q }); }} inputMode="numeric" className={cn(input, "w-14 text-center tabular-nums")} />
                </label>
              </div>
            </>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-1.5">
              {o.status === "WAITING" && <Button size="sm" onClick={() => onChange({ status: "GOT" }, "ရပြီ")}><Check size={14} className="mr-1 inline" />ရပြီ</Button>}
              {o.status === "GOT" && <Button size="sm" onClick={() => onChange({ status: "DONE" }, "ပေးပြီး")}><PackageCheck size={14} className="mr-1 inline" />ပေးပြီး</Button>}
              {o.status !== "WAITING" && <Button size="sm" variant="ghost" onClick={() => onChange({ status: "WAITING" })}><RotateCcw size={14} className="mr-1 inline" />ပြန်စောင့်</Button>}
              <span className="flex-1" />
              <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" aria-label="Delete" title="Delete"><Trash2 size={15} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

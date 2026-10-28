"use client";

import { useEffect, useState } from "react";
import { HeartHandshake, MessageSquareHeart, Trash2 } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { Donation } from "@/lib/community";

const input = "min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm";

interface FeedbackRow {
  id: string; shopName: string; userName: string; rating: number | null; message: string; shown: boolean; createdAt: string;
}

const blank = { name: "", amount: "", method: "KPay", date: "", note: "" };

/** The About page's community parts: the donations list (typed in by hand, since money comes
 *  in outside the app) and the shops' feedback, each shown there only once picked here. */
export function AdminCommunity() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [form, setForm] = useState(blank);
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/donations", { cache: "no-store" }).then((r) => r.json()).then((b) => b.ok && setDonations(b.data)).catch(() => {});
    fetch("/api/admin/feedback", { cache: "no-store" }).then((r) => r.json()).then((b) => setFeedback(b.ok ? b.data : [])).catch(() => setFeedback([]));
  }, []);

  async function saveDonations(next: Donation[], done: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/donations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Failed");
      setDonations(body.data);
      setMsg(done);
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addDonation() {
    const amount = Number(form.amount.replace(/[,\s]/g, ""));
    const item: Donation = { id: Date.now().toString(36), name: form.name.trim(), amount: Math.round(amount), method: form.method.trim(), date: form.date, note: form.note.trim() || undefined };
    if (await saveDonations([...donations, item], "Donation added")) setForm(blank);
  }

  async function setShown(row: FeedbackRow, shown: boolean) {
    const res = await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, shown }) });
    if (res.ok) setFeedback((list) => list?.map((f) => (f.id === row.id ? { ...f, shown } : f)) ?? null);
  }

  async function removeFeedback(row: FeedbackRow) {
    if (!window.confirm("Delete this feedback?")) return;
    const res = await fetch(`/api/admin/feedback?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    if (res.ok) setFeedback((list) => list?.filter((f) => f.id !== row.id) ?? null);
  }

  const sorted = [...donations].sort((a, b) => b.amount - a.amount);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <HeartHandshake size={18} className="text-teal-600" />
          <h2 className="text-sm font-semibold">Top donations</h2>
          <span className="ml-auto text-xs text-gray-500">{`${donations.length} on the About page`}</span>
        </div>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {sorted.length === 0 && <p className="p-3 text-sm text-gray-500">No donations yet.</p>}
          {sorted.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs text-gray-500">{[d.method, d.date, d.note].filter(Boolean).join(" · ")}</div>
              </div>
              <b className="whitespace-nowrap tabular-nums">{`${d.amount.toLocaleString("en-US")} Ks`}</b>
              <button type="button" aria-label="Remove" disabled={busy} onClick={() => window.confirm(`Remove ${d.name}?`) && saveDonations(donations.filter((x) => x.id !== d.id), "Donation removed")} className="text-gray-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Donor / shop name" className={input} />
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" placeholder="Amount (Ks)" className={input} />
          <input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="KPay / Wave / USDT" className={input} />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optional)" className={cn(input, "sm:col-span-2")} />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={busy || !form.name.trim() || !(Number(form.amount.replace(/[,\s]/g, "")) > 0)} onClick={addDonation}>Add donation</Button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <MessageSquareHeart size={18} className="text-blue-600" />
          <h2 className="text-sm font-semibold">User feedback</h2>
          <span className="ml-auto text-xs text-gray-500">Tick &quot;Show&quot; to put one on the About page</span>
        </div>
        {feedback === null ? <p className="text-sm text-gray-500">Loading…</p> : feedback.length === 0 ? (
          <p className="text-sm text-gray-500">No feedback yet.</p>
        ) : (
          <div className="max-h-[32rem] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {feedback.map((f) => (
              <div key={f.id} className="space-y-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <b className="min-w-0 truncate">{f.shopName}</b>
                  <span className="truncate text-xs text-gray-500">{f.userName}</span>
                  {f.rating && <span className="text-xs text-amber-500">{"★".repeat(f.rating)}</span>}
                  <span className="ml-auto whitespace-nowrap text-[11px] text-gray-400">{fmtDateTime(f.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">{f.message}</p>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={f.shown} onChange={(e) => setShown(f, e.target.checked)} className="h-4 w-4" />
                    Show on About page
                  </label>
                  <button type="button" onClick={() => removeFeedback(f)} className="ml-auto text-gray-400 hover:text-red-600">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

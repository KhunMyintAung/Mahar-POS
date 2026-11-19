"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Clock, RotateCcw } from "lucide-react";
import { Button, Modal, Input, cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface Pending {
  id: string; months: number; tier: string; amountMinor: number; amountThb: number | null; method: string; slipUrl: string; createdAt: string;
  business: { name: string; phone: string | null; proUntil: string | null };
}
interface Recent {
  id: string; months: number; tier: string; amountMinor: number; amountThb: number | null; method: string; status: string; note: string | null;
  reviewedAt: string | null; createdAt: string; business: { name: string };
}

/** Admin → Payments. The operator reviews each shop's Pro payment: opens the slip, and approves
 *  (which extends that shop's Pro) or rejects with a reason. */
export function AdminProPayments() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const [reject, setReject] = useState<Pending | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [voidTarget, setVoidTarget] = useState<Recent | null>(null);
  const [voidNote, setVoidNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pro-payments", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Could not load payments");
      setPending(body.data.pending);
      setRecent(body.data.recent);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments");
    }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  async function review(id: string, action: "approve" | "reject" | "void", note?: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/pro-payments/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Failed");
      setReject(null); setRejectNote("");
      setVoidTarget(null); setVoidNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const kyat = (minor: number) => (minor / 100).toLocaleString("en-US");
  const levelName = (tier: string) => (tier === "FULL" ? "Fully Access" : "Pro");
  /** What the payer was asked to send: baht for PromptPay (with the kyat total beside it), kyat otherwise. */
  const asked = (p: { method: string; amountMinor: number; amountThb: number | null }) =>
    p.method === "PROMPAY" && p.amountThb != null ? `${p.amountThb.toLocaleString("en-US")} THB (${kyat(p.amountMinor)} Ks)` : `${kyat(p.amountMinor)} Ks`;
  const methodName = (m: string) => (m === "PROMPAY" ? "PromptPay" : "KBZ Pay");

  return (
    <section className="space-y-4">
      <div className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-800">
          <Clock size={16} className="text-amber-500" />
          <h2 className="text-sm font-semibold">Pro payments to review ({pending.length})</h2>
        </header>
        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
        {pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Nothing waiting. New payments appear here.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {pending.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                <button type="button" onClick={() => setSlip(p.slipUrl)} className="shrink-0" aria-label="View payment slip">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data URL slip */}
                  <img src={p.slipUrl} alt="Payment slip" className="h-20 w-20 rounded-lg border border-gray-200 object-cover dark:border-gray-700" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.business.name}</div>
                  <div className="text-xs text-gray-500">{p.business.phone || "no phone"} · {fmtDateTime(p.createdAt)}</div>
                  <div className="mt-1 text-sm">{levelName(p.tier)} · {p.months} month{p.months === 1 ? "" : "s"} · <b>{asked(p)}</b> · {methodName(p.method)}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === p.id} onClick={() => review(p.id, "approve")}>
                    <BadgeCheck size={14} className="mr-1 inline" />Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => { setReject(p); setRejectNote(""); }}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header className="border-b border-gray-200 p-4 dark:border-gray-800"><h2 className="text-sm font-semibold">Recently reviewed</h2></header>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">None yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {recent.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="font-medium">{r.business.name}</span>
                <span className="text-gray-500">{levelName(r.tier)} · {r.months} mo · {asked(r)} · {r.reviewedAt ? fmtDateTime(r.reviewedAt) : ""}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold",
                    r.status === "APPROVED" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : r.status === "VOIDED" ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")}>
                    {r.status === "APPROVED" ? "Approved" : r.status === "VOIDED" ? "Voided" : "Rejected"}{r.note ? ` · ${r.note}` : ""}
                  </span>
                  {r.status === "APPROVED" && (
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => { setVoidTarget(r); setVoidNote(""); }}>
                      <RotateCcw size={13} className="mr-1 inline" />Void
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={Boolean(slip)} onClose={() => setSlip(null)} title="Payment slip" wide>
        {slip && (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL slip
          <img src={slip} alt="Payment slip" className="mx-auto max-h-[70vh] rounded-lg" />
        )}
      </Modal>

      <Modal open={Boolean(reject)} onClose={() => setReject(null)} title={`Reject payment · ${reject?.business.name ?? ""}`}
        footer={<>
          <Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button>
          <Button variant="danger" disabled={busy === reject?.id} onClick={() => reject && review(reject.id, "reject", rejectNote.trim() || undefined)}>Reject payment</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">The shop is told it was not confirmed and can submit again. Give a short reason so they know what to fix.</p>
          <Input label="Reason (optional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. slip amount does not match" />
        </div>
      </Modal>

      <Modal open={Boolean(voidTarget)} onClose={() => setVoidTarget(null)} title={`Void payment · ${voidTarget?.business.name ?? ""}`}
        footer={<>
          <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button>
          <Button variant="danger" disabled={busy === voidTarget?.id} onClick={() => voidTarget && review(voidTarget.id, "void", voidNote.trim() || undefined)}>Void payment</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Undoes this approval: the shop&apos;s Pro goes back to the date it had before, as if the payment had never been approved. Use this when it was approved by mistake.
          </p>
          <Input label="Reason (optional)" value={voidNote} onChange={(e) => setVoidNote(e.target.value)} placeholder="e.g. approved the wrong shop" />
        </div>
      </Modal>
    </section>
  );
}

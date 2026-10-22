"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, RefreshCw, Send, TestTube2 } from "lucide-react";
import { Button, ConfirmDialog, cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface Log { id: string; to: string; subject: string; kind: string; status: string; error: string | null; createdAt: string }
interface Broadcast { id: string; subject: string; audience: string; recipients: number; sent: number; failed: number; status: string; createdBy: string | null; createdAt: string; finishedAt: string | null }
interface Data {
  configured: boolean; from: string | null;
  domains: { name: string; status: string }[];
  counts: { today: number; week: number; last30: Record<string, number> };
  audiences: { owners: number; users: number };
  logs: { items: Log[]; total: number; page: number; pageSize: number };
  broadcasts: Broadcast[];
}

const STATUS_TONE: Record<string, string> = {
  SENT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  opened: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  clicked: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  bounced: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  complained: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  delivery_delayed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};
const KIND_LABEL: Record<string, string> = { WELCOME: "Welcome", RESET: "Password reset", SIGNUP_ALERT: "Sign-up alert", BROADCAST: "Broadcast", TEST: "Test" };

const input = "min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || "Failed");
  return body.data as T;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={cn("mt-2 text-2xl font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

/** The admin portal's email desk, in the spirit of Resend's dashboard: what was sent and
 *  what became of it, and a composer for messages to many users at once. */
export function AdminEmail() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Composer
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"owners" | "users" | "custom">("owners");
  const [custom, setCustom] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), q, kind, status });
    return call<Data>(`/api/admin/email?${p}`);
  }, [page, q, kind, status]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      load().then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Failed"));
    }, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  // While a broadcast is sending, keep its progress current.
  const sending = data?.broadcasts.some((b) => b.status === "SENDING" || b.status === "QUEUED");
  useEffect(() => {
    if (!sending) return;
    const t = window.setInterval(() => { load().then(setData).catch(() => {}); }, 3000);
    return () => window.clearInterval(t);
  }, [sending, load]);

  async function refreshStatuses() {
    setRefreshing(true);
    try {
      const r = await call<{ changed: number }>("/api/admin/email/refresh", { method: "POST" });
      setNote(`${r.changed} status update(s) from Resend`);
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRefreshing(false);
    }
  }

  const emails = custom.split(/[\s,;]+/).filter((x) => x.includes("@"));
  const count = audience === "owners" ? data?.audiences.owners ?? 0 : audience === "users" ? data?.audiences.users ?? 0 : new Set(emails.map((e) => e.toLowerCase())).size;
  const ready = subject.trim().length >= 3 && body.trim().length >= 5;

  async function showPreview() {
    try {
      const r = await call<{ html: string }>("/api/admin/email/broadcast", { method: "PUT", body: JSON.stringify({ subject, body }) });
      setPreview(r.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function send(test: boolean) {
    setBusy(true);
    setNote("");
    try {
      const r = await call<{ to?: string; recipients?: number }>("/api/admin/email/broadcast", {
        method: "POST",
        body: JSON.stringify({ subject, body, audience, emails: audience === "custom" ? emails : undefined, test }),
      });
      setNote(test ? `Test sent to ${r.to}` : `Sending to ${r.recipients} people — progress below`);
      if (!test) { setSubject(""); setBody(""); setCustom(""); setPreview(null); }
      setConfirm(false);
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const last30 = data?.counts.last30 ?? {};
  const pages = data ? Math.max(1, Math.ceil(data.logs.total / data.logs.pageSize)) : 1;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {note && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">{note}</div>}

      {/* Setup */}
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-900">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", data?.configured ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>{data?.configured ? "Resend connected" : "Email not set up"}</span>
        {data?.from && <span className="text-gray-600 dark:text-gray-300">From: <b>{data.from}</b></span>}
        {data?.domains.map((d) => (
          <span key={d.name} className="text-gray-600 dark:text-gray-300">{d.name}: <b className={d.status === "verified" ? "text-green-700" : "text-amber-700"}>{d.status}</b></span>
        ))}
      </section>

      {/* Counts */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sent today" value={data?.counts.today ?? "-"} />
        <Stat label="Last 7 days" value={data?.counts.week ?? "-"} />
        <Stat label="Delivered (30d)" value={last30.delivered ?? 0} tone="text-green-600" />
        <Stat label="Opened (30d)" value={(last30.opened ?? 0) + (last30.clicked ?? 0)} tone="text-blue-600" />
        <Stat label="Bounced (30d)" value={(last30.bounced ?? 0) + (last30.complained ?? 0)} tone="text-red-600" />
        <Stat label="Failed (30d)" value={last30.FAILED ?? 0} tone="text-red-600" />
      </section>

      {/* Composer */}
      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header className="border-b border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold">New broadcast</h2>
          <p className="mt-1 text-xs text-gray-500">Write plainly: a blank line starts a paragraph, “- ” a bullet, **bold**, links become clickable, and <code>[button: Open app](https://app.maharpos.shop)</code> makes a button.</p>
        </header>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Send to</label>
              <div className="flex flex-wrap gap-2">
                {([["owners", `Shop owners (${data?.audiences.owners ?? 0})`], ["users", `All users (${data?.audiences.users ?? 0})`], ["custom", "My own list"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setAudience(k)} className={cn("rounded-full border px-3 py-1.5 text-sm", audience === k ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 dark:border-gray-700")}>{label}</button>
                ))}
              </div>
            </div>
            {audience === "custom" && (
              <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={3} placeholder="Emails, one per line or separated by commas" className={cn(input, "py-2")} />
            )}
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={input} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder={"မင်္ဂလာပါ…\n\n- Feature one\n- Feature two\n\n[button: App ဖွင့်မည်](https://app.maharpos.shop)"} className={cn(input, "py-2 font-mono text-sm")} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!ready || busy} onClick={showPreview}><Eye size={15} className="mr-1 inline" />Preview</Button>
              <Button variant="secondary" disabled={!ready || busy} onClick={() => send(true)}><TestTube2 size={15} className="mr-1 inline" />Send test to me</Button>
              <Button disabled={!ready || busy || count === 0 || !data?.configured} onClick={() => setConfirm(true)}><Send size={15} className="mr-1 inline" />Send to {count}</Button>
            </div>
          </div>
          <div className="min-h-64 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
            {preview ? (
              <iframe title="Email preview" sandbox="" srcDoc={preview} className="h-[28rem] w-full bg-white" />
            ) : (
              <div className="grid h-full min-h-64 place-items-center p-6 text-center text-sm text-gray-400">Press Preview to see the email as people will get it.</div>
            )}
          </div>
        </div>
      </section>

      {/* Broadcast history */}
      {data && data.broadcasts.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="border-b border-gray-200 p-4 text-sm font-semibold dark:border-gray-800">Broadcasts</header>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.broadcasts.map((b) => {
              const pct = b.recipients ? Math.round(((b.sent + b.failed) / b.recipients) * 100) : 0;
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.subject}</div>
                    <div className="text-xs text-gray-500">{fmtDateTime(b.createdAt)} · {b.audience} · by {b.createdBy ?? "admin"}</div>
                  </div>
                  <div className="w-40">
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full bg-blue-600" style={{ width: `${pct}%` }} /></div>
                    <div className="mt-1 text-xs text-gray-500">{b.sent} sent · {b.failed} failed · {b.recipients} total</div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", b.status === "DONE" ? "bg-green-100 text-green-800" : b.status === "STOPPED" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800")}>{b.status === "STOPPED" ? "Stopped (quota)" : b.status}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Log */}
      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-semibold">Emails ({data?.logs.total ?? 0})</h2>
            <p className="mt-1 text-xs text-gray-500">Every email the app sent. Statuses come from Resend; press Refresh to update them.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="To or subject" className={cn(input, "w-48")} />
            <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className={cn(input, "w-auto")}>
              <option value="">All kinds</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={cn(input, "w-auto")}>
              <option value="">All statuses</option>
              {["SENT", "delivered", "opened", "clicked", "bounced", "complained", "FAILED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button variant="secondary" disabled={refreshing} onClick={refreshStatuses}><RefreshCw size={15} className={cn("mr-1 inline", refreshing && "animate-spin")} />Refresh</Button>
          </div>
        </header>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60">
              <tr>{["Time", "To", "Subject", "Kind", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data?.logs.items.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(l.createdAt)}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2">{l.to}</td>
                  <td className="max-w-[22rem] truncate px-3 py-2" title={l.error ?? l.subject}>{l.subject}</td>
                  <td className="px-3 py-2 text-xs">{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td className="px-3 py-2"><span title={l.error ?? ""} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[l.status] ?? STATUS_TONE.SENT)}>{l.status}</span></td>
                </tr>
              ))}
              {data && data.logs.items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No emails yet</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-3 text-sm dark:border-gray-800">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
            <span>{page} / {pages}</span>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => send(false)}
        title="Send broadcast"
        message={`Send “${subject}” to ${count} ${audience === "owners" ? "shop owners" : audience === "users" ? "users" : "addresses"}? Each person gets their own copy.`}
        confirmLabel={`Send to ${count}`}
      />
    </div>
  );
}

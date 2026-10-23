"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, FileSpreadsheet, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, cn, useToast } from "@/components/ui";

type Interval = "hourly" | "daily";
interface Cfg { url: string | null; auto: boolean; interval: Interval; time: string; lastSent: string | null; lastResult: string | null; script: string }

const field = "min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm";
const URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,200}\/exec$/;

/** "2026-10-22T07:41:00.000Z · 7 sheets synced" → { at: Date, text: "7 sheets synced", ok } */
function lastRun(result: string | null) {
  if (!result) return null;
  const [stamp, ...rest] = result.split(" · ");
  const at = new Date(stamp);
  const text = rest.join(" · ");
  return { at: Number.isNaN(+at) ? null : at, text, ok: !text.startsWith("failed") };
}

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-5" : "left-0.5")} />
    </button>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={cn("z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold",
        done ? "bg-green-600 text-white" : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300")}>
        {done ? <Check size={15} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1.5 space-y-2 text-sm text-gray-600 dark:text-gray-300">{children}</div>
      </div>
    </li>
  );
}

/** Settings → Google Sheet: connect a sheet in three steps, then keep it in sync. Only
 *  values are written, so the sheet keeps whatever formatting the owner gives it. */
export function GsheetSyncCard() {
  const { push } = useToast();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"" | "connect" | "sync" | "save">("");
  const [error, setError] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    api<Cfg>("/api/v1/reports/gsheet").then((c) => { setCfg(c); setUrl(c.url ?? ""); }).catch((e) => setError(e.message));
  }, []);

  async function save(next: Partial<Pick<Cfg, "url" | "auto" | "interval" | "time">>, quiet = false) {
    if (!cfg) return;
    const body = { url: next.url ?? cfg.url ?? "", auto: next.auto ?? cfg.auto, interval: next.interval ?? cfg.interval, time: next.time ?? cfg.time };
    setCfg({ ...cfg, ...body, url: body.url || null });
    setBusy("save");
    try {
      const c = await api<Omit<Cfg, "script">>("/api/v1/reports/gsheet", { method: "PUT", body });
      setCfg((old) => (old ? { ...old, ...c } : old));
      if (!quiet) push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy("");
    }
  }

  async function syncNow() {
    setBusy("sync");
    setError("");
    try {
      const r = await api<{ sheets: number }>("/api/v1/reports/gsheet", { method: "POST", body: {} });
      const fresh = await api<Cfg>("/api/v1/reports/gsheet");
      setCfg(fresh);
      push(`${r.sheets} sheets synced`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      return false;
    } finally {
      setBusy("");
    }
  }

  /** Saves the URL and proves it works with a first sync. */
  async function connect() {
    const u = url.trim();
    if (!URL_PATTERN.test(u)) { setError("Paste the Web app URL — it starts with https://script.google.com/macros/s/ and ends with /exec"); return; }
    setBusy("connect");
    setError("");
    const before = { url: cfg?.url ?? "", auto: cfg?.auto ?? false, interval: cfg?.interval ?? "daily", time: cfg?.time ?? "22:00" };
    try {
      await api("/api/v1/reports/gsheet", { method: "PUT", body: { ...before, url: u, auto: true } });
      try {
        const r = await api<{ sheets: number }>("/api/v1/reports/gsheet", { method: "POST", body: {} });
        setCfg(await api<Cfg>("/api/v1/reports/gsheet"));
        setSetupOpen(false);
        push(`Connected — ${r.sheets} sheets synced`);
      } catch (e) {
        // The test failed: keep the sheet that worked before, not the new URL.
        await api("/api/v1/reports/gsheet", { method: "PUT", body: before }).catch(() => {});
        throw e;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the sheet");
    } finally {
      setBusy("");
    }
  }

  async function copyScript() {
    if (!cfg) return;
    try {
      await navigator.clipboard.writeText(cfg.script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      push("Could not copy. Select the script and copy it.", "error");
    }
  }

  if (!cfg) return <Card><p className="text-sm text-gray-400">{error || "Loading…"}</p></Card>;
  const connected = Boolean(cfg.url);
  const last = lastRun(cfg.lastResult);
  const showSetup = !connected || setupOpen;

  return (
    <Card className="space-y-4">
      {/* Header + status */}
      <div>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><FileSpreadsheet size={22} /></span>
          <h3 className="min-w-0 flex-1 text-base font-semibold">Google Sheet sync</h3>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", connected ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-500">Your reports in your own Google Sheet. Only the numbers change — your colours, column widths and fonts stay as you set them.</p>
      </div>

      {/* Connected: status and controls */}
      {connected && (
        <div className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {last ? (
              <span className={cn("flex items-center gap-1.5", last.ok ? "text-green-700 dark:text-green-400" : "text-red-600")}>
                {last.ok ? <CheckCircle2 size={16} /> : <Unplug size={16} />}
                {last.ok ? "Last sync" : "Last sync failed"}{last.at && ` · ${last.at.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`}
                <span className="text-gray-500">· {last.text.replace(/^failed: /, "")}</span>
              </span>
            ) : <span className="text-gray-500">Not synced yet</span>}
            <Button size="sm" className="ml-auto" disabled={busy !== ""} onClick={syncNow}>
              {busy === "sync" ? <Loader2 size={15} className="mr-1 inline animate-spin" /> : <RefreshCw size={15} className="mr-1 inline" />}Sync now
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <Switch on={cfg.auto} disabled={busy !== ""} onChange={(v) => save({ auto: v }, true)} />
            <span className="text-sm font-medium">Auto sync</span>
            <div className={cn("inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700", !cfg.auto && "opacity-50")}>
              {(["hourly", "daily"] as const).map((k) => (
                <button key={k} type="button" disabled={!cfg.auto || busy !== ""} onClick={() => save({ interval: k }, true)}
                  className={cn("rounded-md px-3 py-1.5 text-sm", cfg.interval === k ? "bg-green-600 text-white" : "text-gray-600 dark:text-gray-300")}>
                  {k === "hourly" ? "Every hour" : "Every day"}
                </button>
              ))}
            </div>
            {cfg.auto && cfg.interval === "daily" && (
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">at
                <input type="time" value={cfg.time} onChange={(e) => setCfg({ ...cfg, time: e.target.value })} onBlur={(e) => save({ time: e.target.value }, true)} className={field} />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500">Each sync sends this month (daily summary, Stock) and this year&apos;s monthly summary, one tab each.</p>

          <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
            <button type="button" className="flex items-center gap-1 text-blue-600" onClick={() => setSetupOpen(!setupOpen)}><Link2 size={14} />{setupOpen ? "Hide setup" : "Change sheet / update script"}</button>
            <button type="button" className="flex items-center gap-1 text-red-600" disabled={busy !== ""} onClick={() => { if (window.confirm("Disconnect this Google Sheet? Your sheet keeps what it has.")) { setUrl(""); save({ url: "", auto: false }); } }}><Unplug size={14} />Disconnect</button>
          </div>
        </div>
      )}

      {/* Setup: three steps */}
      {showSetup && (
        <ol className="relative rounded-xl bg-gray-50 p-4 before:absolute before:bottom-6 before:left-[29px] before:top-7 before:w-px before:bg-gray-200 dark:bg-gray-800/50 dark:before:bg-gray-700">
          <Step n={1} title="Copy the script" done={copied}>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copyScript}>{copied ? <><Check size={15} className="mr-1 inline" />Copied</> : <><Copy size={15} className="mr-1 inline" />Copy script</>}</Button>
              <a href="https://sheets.new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-white dark:border-gray-700 dark:hover:bg-gray-900">
                <ExternalLink size={14} />Open a new Google Sheet
              </a>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500">See the script</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">{cfg.script}</pre>
            </details>
          </Step>
          <Step n={2} title="Add it to the sheet">
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>In the sheet: <b>Extensions → Apps Script</b>. Delete what is there, paste, press <b>Save</b>.</li>
              <li><b>Deploy → New deployment</b> → type <b>Web app</b> · Execute as <b>Me</b> · Who has access <b>Anyone</b> → <b>Deploy</b>.</li>
              <li>Allow access with your Google account, then copy the <b>Web app URL</b>.</li>
            </ol>
            {connected && <p className="text-xs text-gray-500">Updating an existing sheet? Use <b>Deploy → Manage deployments → Edit → New version</b> so the URL stays the same.</p>}
          </Step>
          <Step n={3} title="Paste the Web app URL and connect" done={connected && !setupOpen}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} placeholder="https://script.google.com/macros/s/…/exec" className={cn(field, "min-w-0 flex-1")} />
              <Button disabled={busy !== "" || !url.trim()} onClick={connect}>
                {busy === "connect" ? <><Loader2 size={15} className="mr-1 inline animate-spin" />Connecting…</> : connected ? "Save & test" : "Connect & sync"}
              </Button>
            </div>
          </Step>
        </ol>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
    </Card>
  );
}

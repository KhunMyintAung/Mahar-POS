"use client";

import { useEffect, useState } from "react";
import { Copy, UploadCloud } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, useToast } from "@/components/ui";

interface Cfg { url: string | null; auto: boolean; time: string; lastSent: string | null; lastResult: string | null; script: string }

/** Backup to the owner's own Google Sheet through a small Apps Script they paste in. */
export function GsheetBackupCard({ period, date, from, to, label }: { period: string; date: string; from: string; to: string; label: string }) {
  const { push } = useToast();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [url, setUrl] = useState("");
  const [auto, setAuto] = useState(false);
  const [time, setTime] = useState("22:00");
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    api<Cfg>("/api/v1/reports/gsheet").then((c) => {
      setCfg(c); setUrl(c.url ?? ""); setAuto(c.auto); setTime(c.time); setShowSteps(!c.url);
    }).catch((e) => push(e.message, "error"));
  }, [push]);

  async function save() {
    setBusy(true);
    try {
      const c = await api<Omit<Cfg, "script">>("/api/v1/reports/gsheet", { method: "PUT", body: { url: url.trim(), auto, time } });
      setCfg((old) => (old ? { ...old, ...c } : old));
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function backup() {
    setBusy(true);
    try {
      const body = period === "range" ? { period, from, to } : { period, date };
      const r = await api<{ sheets: number }>("/api/v1/reports/gsheet", { method: "POST", body });
      push(`${label}: ${r.sheets} sheets sent to Google Sheet`);
    } catch (e) {
      push(e instanceof Error ? e.message : "Backup failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyScript() {
    if (!cfg) return;
    try {
      await navigator.clipboard.writeText(cfg.script);
      push("Script copied");
    } catch {
      push("Could not copy. Select the script and copy it.", "error");
    }
  }

  if (!cfg) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Google Sheet backup</h3>
        <button className="text-sm text-blue-600" onClick={() => setShowSteps(!showSteps)}>{showSteps ? "Hide setup" : "How to set up"}</button>
      </div>

      {showSteps && (
        <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open <a className="text-blue-600 underline" href="https://sheets.new" target="_blank" rel="noreferrer">a new Google Sheet</a> with your Google account.</li>
            <li>Menu <b>Extensions → Apps Script</b>. Delete what is there and paste the script below.</li>
            <li>Click <b>Deploy → New deployment</b>, type <b>Web app</b>, Execute as <b>Me</b>, Who has access <b>Anyone</b>. Deploy and allow access.</li>
            <li>Copy the <b>Web app URL</b> (ends with /exec), paste it here and Save.</li>
          </ol>
          <div className="relative">
            <pre className="max-h-48 overflow-auto rounded border border-gray-200 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-900">{cfg.script}</pre>
            <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={copyScript}><Copy size={14} className="mr-1 inline" />Copy</Button>
          </div>
          <p className="text-xs text-gray-500">The script has a private key, so only this shop can write to your sheet. Each report goes to its own tab, e.g. &quot;{label} Grand Report&quot;.</p>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input label="Web app URL" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Back up every day at
          </label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={busy} onClick={save}>Save</Button>
        <Button disabled={busy || !cfg.url} onClick={backup}><UploadCloud size={16} className="mr-1 inline" />Back up {label} now</Button>
        {cfg.lastResult && <span className="text-xs text-gray-500">Last: {cfg.lastResult.replace(/T(\d\d:\d\d).*? ·/, " $1 UTC ·")}</span>}
      </div>
      <p className="mt-2 text-xs text-gray-500">The daily backup sends this month and this year: Grand Report, summary and Stock.</p>
    </Card>
  );
}

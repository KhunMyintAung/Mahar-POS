"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { AnnouncementBar, type AnnouncementView } from "@/components/AnnouncementBanner";

const input = "min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm";

/** Edits the notice every shop sees at the top of the app. */
export function AdminAnnouncement() {
  const [a, setA] = useState<Omit<AnnouncementView, "version">>({ enabled: false, text: "", tone: "info", link: "", linkLabel: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/announcement", { cache: "no-store" }).then((r) => r.json()).then((b) => {
      if (b.ok && b.data) setA({ enabled: b.data.enabled, text: b.data.text, tone: b.data.tone, link: b.data.link ?? "", linkLabel: b.data.linkLabel ?? "" });
    }).catch(() => {});
  }, []);

  async function save(enabled: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/announcement", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...a, enabled, link: a.link ?? "", linkLabel: a.linkLabel ?? "" }) });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Failed");
      setA((x) => ({ ...x, enabled }));
      setMsg(enabled ? "Announcement is live for every shop" : "Announcement is hidden");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Megaphone size={18} className="text-blue-600" />
        <h2 className="text-sm font-semibold">Announcement banner</h2>
        <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold", a.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}>{a.enabled ? "Live" : "Off"}</span>
      </div>
      <p className="text-xs text-gray-500">Shown at the top of the app for every signed-in shop, for news, maintenance or offers. People can close it; it comes back when you change it.</p>
      <textarea value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} rows={3} maxLength={500} placeholder="ဥပမာ — ယနေ့ ည ၁၀ နာရီ ၁၀ မိနစ်ခန့် System Update လုပ်ပါမည်။" className={cn(input, "py-2")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <select value={a.tone} onChange={(e) => setA({ ...a, tone: e.target.value as AnnouncementView["tone"] })} className={input}>
          <option value="info">Blue — news</option>
          <option value="success">Green — good news</option>
          <option value="warning">Amber — warning</option>
        </select>
        <input value={a.link ?? ""} onChange={(e) => setA({ ...a, link: e.target.value })} placeholder="Link (optional) https://…" className={input} />
        <input value={a.linkLabel ?? ""} onChange={(e) => setA({ ...a, linkLabel: e.target.value })} placeholder="Link text, e.g. Read more" className={input} />
      </div>
      {a.text.trim() && (
        <div>
          <div className="mb-1 text-xs font-medium text-gray-500">Preview</div>
          <AnnouncementBar a={{ ...a, version: "preview" }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || !a.text.trim()} onClick={() => save(true)}>{a.enabled ? "Update" : "Publish"}</Button>
        {a.enabled && <Button variant="secondary" disabled={busy} onClick={() => save(false)}>Hide</Button>}
        {msg && <span className="text-sm text-gray-600 dark:text-gray-300">{msg}</span>}
      </div>
    </section>
  );
}

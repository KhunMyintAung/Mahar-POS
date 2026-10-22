"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/client";
import { cn } from "@/components/ui";

export interface AnnouncementView {
  enabled: boolean; text: string; tone: "info" | "success" | "warning";
  link: string | null; linkLabel: string | null; version: string;
}

const TONE = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100",
  success: "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/50 dark:text-green-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
};

/** The banner itself, also used as the admin editor's preview. */
export function AnnouncementBar({ a, onClose }: { a: AnnouncementView; onClose?: () => void }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm", TONE[a.tone] ?? TONE.info)} role="status">
      <span className="min-w-0 flex-1 whitespace-pre-line">
        {a.text}
        {a.link && /^https:\/\//.test(a.link) && (
          <> <a href={a.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{a.linkLabel || "Open"}</a></>
        )}
      </span>
      {onClose && <button type="button" aria-label="Close" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100"><X size={16} /></button>}
    </div>
  );
}

const KEY = "mahar.announcementClosed";

/** The platform announcement at the top of the app, until the person closes it. */
export function AnnouncementBanner() {
  const [a, setA] = useState<AnnouncementView | null>(null);

  useEffect(() => {
    api<AnnouncementView | null>("/api/v1/announcement").then((x) => {
      if (!x) return;
      let closed: string | null = null;
      try { closed = localStorage.getItem(KEY); } catch { /* private mode */ }
      if (closed !== x.version) setA(x);
    }).catch(() => {});
  }, []);

  if (!a) return null;
  return (
    <div className="no-print mb-3">
      <AnnouncementBar a={a} onClose={() => { try { localStorage.setItem(KEY, a.version); } catch { /* private mode */ } setA(null); }} />
    </div>
  );
}

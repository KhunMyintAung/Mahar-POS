"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DatabaseBackup, X } from "lucide-react";
import { BACKUP_REMIND_DAYS, deviceLastBackup } from "@/lib/device";
import { useInstalledApp } from "@/lib/installedApp";

const DAY = 24 * 60 * 60 * 1000;
const HIDDEN_KEY = "mahar-pos:backup-reminder-hidden";

function hiddenToday(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

/** On a device shop's dashboard: no backup yet, or none for a week. Hidden for the day once
 *  closed. The books are only on this device, so a backup is the only copy elsewhere. */
export function DeviceBackupReminder() {
  const [show, setShow] = useState<"" | "never" | "old">("");
  const installed = useInstalledApp();

  useEffect(() => {
    let live = true;
    deviceLastBackup()
      .then((at) => {
        if (!live || hiddenToday()) return;
        if (at === null) setShow("never");
        else if (Date.now() - at > BACKUP_REMIND_DAYS * DAY) setShow("old");
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Backups are made in the installed app only.
  if (!show || !installed) return null;

  function hide() {
    try { localStorage.setItem(HIDDEN_KEY, new Date().toDateString()); } catch {}
    setShow("");
  }

  return (
    <div className="no-print mb-2.5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      <DatabaseBackup size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{show === "never" ? "No backup yet" : `No backup for more than ${BACKUP_REMIND_DAYS} days`}</p>
        <p className="mt-0.5 text-xs">{"The shop's books are only on this device. Keep a backup file somewhere else."}</p>
        <Link href="/settings#account" className="mt-1.5 inline-block text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">{"Make a backup"}</Link>
      </div>
      <button onClick={hide} className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label="Close" title="Close">
        <X size={16} />
      </button>
    </div>
  );
}

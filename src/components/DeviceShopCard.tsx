"use client";

import { useEffect, useRef, useState } from "react";
import { DatabaseBackup, Download, HardDrive, RefreshCw, Share2, Upload } from "lucide-react";
import { Button, Card, ConfirmDialog, useToast } from "./ui";
import {
  BACKUP_REMIND_DAYS,
  canShareFile,
  deviceLastBackup,
  deviceReadyAt,
  makeDeviceBackup,
  prepareDevice,
  restoreDeviceBackup,
  saveFile,
} from "@/lib/device";
import { useOnline } from "@/lib/netMode";
import { useInstalledApp } from "@/lib/installedApp";

const DAY = 24 * 60 * 60 * 1000;

/** Settings → Account for a shop kept on this device only: where its books are, how much
 *  room they take, backups, and bringing the app up to date while there is internet. */
export function DeviceShopCard() {
  const online = useOnline();
  const { push } = useToast();
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [usage, setUsage] = useState<{ used: number; persisted: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setReadyAt(deviceReadyAt());
      try {
        const [estimate, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted()]);
        setUsage({ used: estimate.usage ?? 0, persisted });
      } catch {}
    });
    return () => window.clearTimeout(timer);
  }, []);

  async function update() {
    setUpdating(true);
    try {
      await prepareDevice();
      setReadyAt(deviceReadyAt());
      push("The app on this device is up to date. It is used from the next opening.", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not update", "error");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <DeviceBackupCard />
      <Card className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><HardDrive size={16} />{"This device only"}</h3>
          <p className="mt-1 text-xs text-gray-500">{"This shop has no account. Its books are kept in this phone or computer only, and every screen works without the internet."}</p>
        </div>
        <dl className="grid gap-1 rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800/60">
          <div className="flex justify-between gap-2"><dt className="text-gray-500">{"App kept on this device"}</dt><dd>{readyAt ? new Date(readyAt).toLocaleString() : "-"}</dd></div>
          {usage && <div className="flex justify-between gap-2"><dt className="text-gray-500">{"Space used"}</dt><dd>{(usage.used / 1024 / 1024).toFixed(1)} MB</dd></div>}
          {usage && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">{"Kept by the browser"}</dt>
              <dd className={usage.persisted ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>{usage.persisted ? "Yes, permanently" : "Until space runs low"}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">{online ? "With the internet, get the newest version of the app. The shop's books stay as they are." : "Updating the app needs the internet."}</span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={update} disabled={updating || !online}>
            <RefreshCw size={14} className={updating ? "mr-1 inline animate-spin" : "mr-1 inline"} />{updating ? "Updating..." : "Update app"}
          </Button>
        </div>
      </Card>
    </>
  );
}

/** Backups of a device shop's books: a file the owner keeps off the phone (Telegram, Drive,
 *  a computer), and restoring one here, on this phone or a new one. Works without the internet. */
function DeviceBackupCard() {
  const { push } = useToast();
  // When the last backup was made (null: never; undefined: not known yet), and whether it is
  // older than the reminder allows.
  const [last, setLast] = useState<{ at: number | null; overdue: boolean } | undefined>(undefined);
  const [shareable, setShareable] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "share" | "restore">("");
  const [pending, setPending] = useState<File | null>(null);
  const [made, setMade] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastAt = last?.at;
  const installed = useInstalledApp();

  useEffect(() => {
    let live = true;
    const seen = (at: number | null) => {
      if (!live) return;
      setShareable(typeof navigator.share === "function");
      setLast({ at, overdue: at === null || Date.now() - at > BACKUP_REMIND_DAYS * DAY });
    };
    deviceLastBackup().then(seen).catch(() => seen(null));
    return () => { live = false; };
  }, []);

  async function backup(how: "save" | "share") {
    setBusy(how);
    try {
      const file = await makeDeviceBackup();
      setLast({ at: file.lastModified, overdue: false });
      if (how === "share" && canShareFile(file)) {
        try {
          await navigator.share({ files: [file], title: file.name });
          push("Backup shared. Keep it somewhere other than this phone.", "success");
        } catch (error) {
          // Closed the share sheet: the backup is still made; offer to save it instead.
          if (error instanceof DOMException && error.name === "AbortError") setMade(file);
          else throw error;
        }
      } else {
        saveFile(file);
        push("Backup saved to this device's downloads. Copy it somewhere other than this phone.", "success");
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not make the backup", "error");
    } finally {
      setBusy("");
    }
  }

  async function restore(file: File) {
    setBusy("restore");
    try {
      await restoreDeviceBackup(file);
      push("The backup is restored.", "success");
      window.setTimeout(() => window.location.replace("/"), 600);
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not restore", "error");
      setBusy("");
    }
  }

  const overdue = last?.overdue ?? false;

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><DatabaseBackup size={16} />{"Backup"}</h3>
        <p className="mt-1 text-xs text-gray-500">{"The shop's books are only on this device. A backup is one file with all of them: keep it somewhere else (Telegram, Google Drive, a computer). On a new phone, set up This device only and restore it."}</p>
      </div>
      <div className="flex justify-between gap-2 rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800/60">
        <span className="text-gray-500">{"Last backup"}</span>
        <span className={overdue ? "font-medium text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}>
          {lastAt === undefined ? "-" : lastAt === null ? "Never" : new Date(lastAt).toLocaleString()}
        </span>
      </div>
      {overdue && lastAt !== undefined && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {lastAt === null ? "No backup yet. If this phone is lost or the app's data is cleared, the books are lost." : `No backup for more than ${BACKUP_REMIND_DAYS} days. Make one now.`}
        </p>
      )}
      {!installed ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{"Backups are made and restored in the installed app only. Open Mahar POS from the phone's home screen, the computer's apps or the Android app."}</p>
      ) : (
      <div className="flex flex-wrap gap-2">
        {shareable && (
          <Button size="sm" onClick={() => backup("share")} disabled={Boolean(busy)}>
            <Share2 size={14} className="mr-1 inline" />{busy === "share" ? "Making backup..." : "Share backup"}
          </Button>
        )}
        <Button size="sm" variant={shareable ? "secondary" : "primary"} onClick={() => backup("save")} disabled={Boolean(busy)}>
          <Download size={14} className="mr-1 inline" />{busy === "save" ? "Making backup..." : "Save backup file"}
        </Button>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)}>
          <Upload size={14} className="mr-1 inline" />{busy === "restore" ? "Restoring..." : "Restore from backup"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".gz,.tgz,application/gzip,application/x-gzip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setPending(file);
          }}
        />
      </div>
      )}
      {made && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">{"The backup is made."}</span>
          <Button size="sm" variant="secondary" onClick={() => { saveFile(made); setMade(null); }}>
            <Download size={14} className="mr-1 inline" />{"Save backup file"}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) void restore(pending); }}
        title="Restore from backup"
        danger
        confirmLabel="Restore"
        message={
          <div className="space-y-2">
            <p>{"The books on this device are replaced by the ones in this backup. Anything recorded after the backup was made is lost."}</p>
            <p className="font-medium">{pending?.name}</p>
            <p>{"Save a backup of the books here first if you may need them."}</p>
          </div>
        }
      />
    </Card>
  );
}

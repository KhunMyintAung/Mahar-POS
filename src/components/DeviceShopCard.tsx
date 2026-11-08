"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, DatabaseBackup, Download, HardDrive, RefreshCw, Share2, Upload } from "lucide-react";
import { Button, Card, CardTitle, ConfirmDialog, Input, useToast } from "./ui";
import {
  BACKUP_REMIND_DAYS,
  canShareFile,
  deviceLastBackup,
  deviceReadyAt,
  makeDeviceBackup,
  moveToAccount,
  type MoveStep,
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
      <MoveToAccountCard />
      <Card className="space-y-3">
        <CardTitle icon={HardDrive} title="This device only" hint="This shop has no account. Its books are kept in this phone or computer only, and every screen works without the internet." />
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

const MOVE_STEPS: Record<MoveStep["step"], string> = {
  update: "Getting the newest app...",
  pack: "Packing the shop's books...",
  send: "Sending the shop...",
  finish: "Opening the online account...",
};

/** Moving the shop into an online account, for a shop that now has the internet: the same
 *  books, then usable from any phone or computer, with staff accounts, Telegram and backups
 *  on the server. */
function MoveToAccountCard() {
  const online = useOnline();
  const installed = useInstalledApp();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<MoveStep | null>(null);
  const [error, setError] = useState("");

  async function move(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await moveToAccount({ username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), password }, setStep);
      window.location.replace("/");
    } catch (err) {
      setStep(null);
      setError(err instanceof Error ? err.message : "The shop could not be moved. Try again.");
    }
  }

  if (!installed) return null;
  const busy = step !== null;
  return (
    <Card className="space-y-3">
      <CardTitle icon={CloudUpload} title="Move to an online account" hint="When the shop has the internet: every record goes into a new online account, to use from any phone or computer, with staff accounts, Telegram and backups on the server." />
      {!open ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={!online}>
          <CloudUpload size={14} className="mr-1 inline" />{online ? "Move to an online account" : "Needs the internet"}
        </Button>
      ) : (
        <form onSubmit={move} className="space-y-3">
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={40} autoComplete="username" disabled={busy} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={160} autoComplete="email" disabled={busy} />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" disabled={busy} />
          <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
            <li>{"You sign in with this username and password from now on, on any device."}</li>
            <li>{"Keep the internet on until it is done. If it stops, nothing is changed: try again."}</li>
            <li>{"Make a backup first. The books on this device are kept, but the app works with the account from then on."}</li>
          </ul>
          {busy && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(({ update: 0.05, pack: 0.15, send: 0.2 + step.done * 0.7, finish: 0.95 })[step.step] * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-gray-500">{MOVE_STEPS[step.step]}</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); setError(""); }} disabled={busy}>{"Cancel"}</Button>
            <Button size="sm" type="submit" className="ml-auto" disabled={busy || !online}>
              {busy ? "Moving..." : "Move the shop"}
            </Button>
          </div>
        </form>
      )}
    </Card>
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
      <CardTitle icon={DatabaseBackup} title="Backup" hint="The shop's books are only on this device. A backup is one file with all of them: keep it somewhere else (Telegram, Google Drive, a computer). On a new phone, set up This device only and restore it." />
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

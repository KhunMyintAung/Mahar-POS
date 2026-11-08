"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CloudOff, HardDrive, Lock, ShieldAlert, Upload, Wifi, type LucideIcon } from "lucide-react";
import { Button, Card, Input, ProgressBar, Select, cn } from "@/components/ui";
import { PageToggles } from "@/components/ThemeToggle";
import { PwaInstall } from "@/components/PwaInstall";
import { useInstalledApp } from "@/lib/installedApp";
import { SELECTABLE_BUSINESS_CATEGORIES, BUSINESS_CATEGORY_LABELS } from "@/lib/modules";
import { createDeviceShop, isDeviceShop, prepareDevice, restoreDeviceBackup } from "@/lib/device";

/** What to know before choosing it. */
const POINTS: { icon: LucideIcon; text: string; warn?: boolean }[] = [
  { icon: CloudOff, text: "The shop's books are kept in this phone or computer only. Nothing is sent to a server." },
  { icon: Wifi, text: "The internet is needed once, now (about 25 MB). After that, none." },
  { icon: Lock, text: "Only this device can open the shop. Another phone or the owner elsewhere cannot see it." },
  { icon: ShieldAlert, text: "If the phone is lost or the app's data is cleared, the books are lost. Keep backups.", warn: true },
];

/** "This device only": a shop with no account and no server. Its books are kept in this
 *  browser and every screen works without the internet, which is needed once, now, to keep
 *  the app on the device. */
export default function DeviceSetupPage() {
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [category, setCategory] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const installed = useInstalledApp();

  useEffect(() => {
    // A device that already holds a shop opens it.
    if (isDeviceShop()) window.location.replace("/");
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!category) return setError("Choose a business category");
    if (!navigator.onLine) return setError("Connect to the internet once to set up. After that the shop works without it.");
    try {
      setStep("Keeping the app on this device...");
      setProgress(0);
      let failed = false;
      await prepareDevice((p) => { if (!failed) setProgress(p * 0.9); }).catch((e) => { failed = true; throw e; });
      setStep("Creating the shop's books...");
      await createDeviceShop({ businessName: businessName.trim(), ownerName: ownerName.trim(), businessCategory: category });
      setProgress(1);
      window.location.replace("/");
    } catch (err) {
      setProgress(null);
      setStep("");
      setError(err instanceof Error ? err.message : "Could not set up. Please try again.");
    }
  }

  /** A new phone: keep the app, then open the shop from the backup in place of a new one. */
  async function restore(file: File) {
    setError("");
    if (!navigator.onLine) return setError("Connect to the internet once to set up. After that the shop works without it.");
    try {
      setStep("Keeping the app on this device...");
      setProgress(0);
      await prepareDevice((p) => setProgress(p * 0.8));
      setStep("Restoring the shop's books...");
      await restoreDeviceBackup(file);
      setProgress(1);
      window.location.replace("/");
    } catch (err) {
      setProgress(null);
      setStep("");
      setError(err instanceof Error ? err.message : "Could not restore. Please try again.");
    }
  }

  const busy = progress !== null;
  return (
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pt-16">
      <PageToggles className="absolute right-4 top-4" />
      <Card className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center gap-2 pt-2 text-center">
          <div className="rounded-2xl bg-white p-1.5 ring-1 ring-gray-100 dark:ring-gray-800">
            <Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={48} height={48} />
          </div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><HardDrive size={20} />{"This device only"}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{"For a shop with no internet: no account, every screen works offline."}</p>
        </div>

        <ul className="mb-5 space-y-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          {POINTS.map(({ icon: Icon, text, warn }) => (
            <li key={text} className={cn("flex items-start gap-2", warn && "font-medium text-amber-700 dark:text-amber-400")}>
              <Icon size={14} className="mt-0.5 shrink-0" /><span>{text}</span>
            </li>
          ))}
        </ul>

        {!installed ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              {"This device only works in the installed app: the app on the phone's home screen, the app installed on the computer, or the Android app. A browser tab may clear its data. Install the app, open it, and set up there."}
            </p>
            <div className="flex justify-center"><PwaInstall /></div>
          </div>
        ) : (<>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Shop name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required minLength={2} maxLength={80} disabled={busy} />
          <Input label="Your name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required minLength={2} maxLength={80} disabled={busy} />
          <Select label="Business category" value={category} onChange={(e) => setCategory(e.target.value)} required disabled={busy}>
            <option value="">Choose category...</option>
            {SELECTABLE_BUSINESS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{BUSINESS_CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
          {busy && (
            <ProgressBar value={progress ?? 0} label={<>{step} {Math.round((progress ?? 0) * 100)}%</>} />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || businessName.trim().length < 2 || ownerName.trim().length < 2}>
            {busy ? "Setting up..." : "Set up on this device"}
          </Button>
        </form>

        <div className="mt-5 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-sm font-medium">{"Have a backup file?"}</p>
          <p className="mt-0.5 text-xs text-gray-500">{"On a new phone, open the shop from a backup made in Settings → Account."}</p>
          <Button variant="secondary" className="mt-2 w-full" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload size={16} className="mr-1 inline" />{"Restore from backup"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".gz,.tgz,application/gzip,application/x-gzip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void restore(file);
            }}
          />
        </div>
        </>)}

        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          {"Have internet at the shop?"}{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/register">{"Create a free account"}</Link>
        </p>
      </Card>
    </main>
  );
}

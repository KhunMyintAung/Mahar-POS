"use client";

import { useEffect, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { Button, Card, useToast } from "./ui";
import { deviceReadyAt, prepareDevice } from "@/lib/device";
import { useOnline } from "@/lib/netMode";

/** Settings → Account for a shop kept on this device only: where its books are, how much
 *  room they take, and bringing the app up to date while there is internet. */
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
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{"If this phone is lost or the app's data is cleared, the books are lost."}</p>
    </Card>
  );
}

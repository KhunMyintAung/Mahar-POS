"use client";

import { HardDrive } from "lucide-react";
import { Card } from "@/components/ui";
import { useInstalledApp } from "@/lib/installedApp";
import { setDeviceShopAllowed, useDeviceShopAllowed } from "@/lib/deviceShopAllowed";

/** Settings → Account (owner): offer "This device only" on this device's sign-in page. Off
 *  on every device until turned on here, and only in the installed app. */
export function DeviceShopAllowCard() {
  const installed = useInstalledApp();
  const allowed = useDeviceShopAllowed();
  return (
    <Card>
      <div className="flex items-start gap-3">
        <HardDrive size={20} className="mt-0.5 shrink-0 text-gray-500" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{"This device only (no internet)"}</h3>
          <p className="mt-1 text-xs text-gray-500">{"Shows \"No internet at the shop?\" on this device's sign-in page, to keep a shop on this device with no account. Other devices do not show it."}</p>
          {installed ? (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowed} onChange={(e) => setDeviceShopAllowed(e.target.checked)} />
              <span>{"Allow on this device"}</span>
            </label>
          ) : (
            <p className="mt-2 text-xs text-amber-600">{"Only in the installed app (phone or computer app, or the Android app). Open the app, then turn it on here."}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

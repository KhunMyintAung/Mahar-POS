"use client";

import { HardDrive } from "lucide-react";
import { Card, CardTitle, Switch } from "@/components/ui";
import { useInstalledApp } from "@/lib/installedApp";
import { setDeviceShopAllowed, useDeviceShopAllowed } from "@/lib/deviceShopAllowed";

/** Settings → Account (owner): offer "This device only" on this device's sign-in page. Off
 *  on every device until turned on here, and only in the installed app. */
export function DeviceShopAllowCard() {
  const installed = useInstalledApp();
  const allowed = useDeviceShopAllowed();
  return (
    <Card>
      <CardTitle
        icon={HardDrive}
        title="This device only (no internet)"
        hint={"Shows \"No internet at the shop?\" on this device's sign-in page, to keep a shop on this device with no account. Other devices do not show it."}
      />
      {installed ? (
        <div className="mt-3 flex min-h-10 items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
          <span className="text-sm font-medium">{"Allow on this device"}</span>
          <Switch on={allowed} label="Allow on this device" onChange={setDeviceShopAllowed} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-600">{"Only in the installed app (phone or computer app, or the Android app). Open the app, then turn it on here."}</p>
      )}
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import { isInstalledApp } from "@/lib/installedApp";

/** Notes, on the first screen, that this window is the installed app (src/lib/installedApp.ts),
 *  before the address loses the start mark. */
export function InstalledAppMark() {
  useEffect(() => { isInstalledApp(); }, []);
  return null;
}

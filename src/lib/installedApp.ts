"use client";

import { useSyncExternalStore } from "react";

// Working without the internet (the till's Sync later and Offline modes, "This device only"
// shops and their backups) is for the installed app only: the phone's installed app (PWA), the
// computer's installed app (PWA) and the Android app (APK). A browser tab may clear its data
// at any time and is not where a shop's books should live.

const MARK = "mahar-pos:installed-app";

/** Whether this window is the installed app. The installed apps open at their start address
 *  (/full-app for the PWA, /play-app for the Android app), which the server sends on with
 *  ?from=pwa or ?from=app; the Android app also says so in the referrer, and an installed
 *  window in its display mode. Remembered for this window, as the address changes. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true;
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
    if (sessionStorage.getItem(MARK) === "1") return true;
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "app" || from === "pwa" || document.referrer.startsWith("android-app://")) {
      sessionStorage.setItem(MARK, "1");
      return true;
    }
  } catch {}
  return false;
}

const noop = () => () => {};

/** isInstalledApp() for rendering: false on the server and the first render. */
export function useInstalledApp(): boolean {
  return useSyncExternalStore(noop, isInstalledApp, () => false);
}

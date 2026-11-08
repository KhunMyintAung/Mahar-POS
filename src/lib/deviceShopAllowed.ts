"use client";

import { useSyncExternalStore } from "react";

// "This device only" (a shop with no account, kept on the device) is offered on the sign-in
// page only on a device the owner has turned it on for, in Settings → Account. Other devices
// never see it. Kept in this device's storage, so it stays after signing out.

const KEY = "mahar-pos:device-shop-allowed";
const EVENT = "mahar-pos:device-shop-allowed";

export function isDeviceShopAllowed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDeviceShopAllowed(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** isDeviceShopAllowed() for rendering: false on the server and the first render. */
export function useDeviceShopAllowed(): boolean {
  return useSyncExternalStore(subscribe, isDeviceShopAllowed, () => false);
}

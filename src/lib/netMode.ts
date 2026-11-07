"use client";

import { useSyncExternalStore } from "react";

/** How this device's till uses the internet. Set per device, as each counter's connection
 *  differs.
 *  - online: every sale is sent at once; without the internet a sale cannot be made.
 *  - sync:   a sale is sent at once when there is internet; without it, the sale is kept on
 *            this device and sent by itself when the internet comes back.
 *  - offline: every sale is kept on this device first and sent only on Sync now (a weak or
 *            costly connection). */
export type NetMode = "online" | "sync" | "offline";

const KEY = "mahar-pos:net-mode";
const EVENT = "mahar-pos:net-mode";
export const DEFAULT_NET_MODE: NetMode = "sync";

/** The caches that let the app open without the internet. They hold the signed-in shop's
 *  data, so they are emptied on sign-out. */
export const OFFLINE_CACHES = ["mahar-data", "mahar-pages"];

export function getNetMode(): NetMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "online" || v === "sync" || v === "offline" ? v : DEFAULT_NET_MODE;
  } catch {
    return DEFAULT_NET_MODE;
  }
}

export function setNetMode(mode: NetMode) {
  try { localStorage.setItem(KEY, mode); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function useNetMode(): NetMode {
  return useSyncExternalStore(subscribe, getNetMode, () => DEFAULT_NET_MODE);
}

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

/** Whether the device says it has a connection (a hint: a connection can still fail). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** fetch() throws a TypeError when the request never reached the server. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

export async function clearOfflineCaches() {
  try {
    if (typeof caches !== "undefined") await Promise.all(OFFLINE_CACHES.map((name) => caches.delete(name)));
  } catch {}
}

"use client";

import { useSyncExternalStore } from "react";
import { isInstalledApp } from "./installedApp";

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
export const DEFAULT_NET_MODE: NetMode = "online";

/** The caches that let the app open without the internet. They hold the signed-in shop's
 *  data, so they are emptied on sign-out. */
export const OFFLINE_CACHES = ["mahar-data", "mahar-pages"];

/** The mode chosen on this device. Sync later and Offline are for the installed app only
 *  (src/lib/installedApp.ts): in a browser tab the till is always online only. */
export function getNetMode(): NetMode {
  if (!isInstalledApp()) return "online";
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
  tellServiceWorker(mode);
}

/** The service worker opens screens by this mode (kept copy or network); it cannot read the
 *  page's storage, so the page tells it on every load and change. */
export function tellServiceWorker(mode: NetMode = getNetMode()) {
  try {
    navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: "net-mode", mode })).catch(() => {});
  } catch {}
}

const READY_KEY = "mahar-pos:offline-ready-at";

/** When this device last kept the till (screen, items, prices, wallets) for use offline. */
export function offlineReadyAt(): number | null {
  try {
    const v = Number(localStorage.getItem(READY_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** The built files a page or script names (/_next/static/…), which the till needs offline. */
export function staticAssetsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~]+?\.(?:js|css|woff2?|png|svg)/g)) {
    const path = m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`;
    if (!path.includes("..")) found.add(path);
  }
  return [...found];
}

/** Gets the till ready to work without the internet, while there is a connection: keeps the
 *  POS screen, every built file it loads (followed through the scripts, as some load others
 *  only when needed), and the data the till reads (dataUrls, exactly as the POS asks for
 *  them). The service worker keeps the files and data as they pass. Resolves true when all of
 *  it was kept. */
/** The screens kept for use without the internet: the till, repairs and the items list. */
export const OFFLINE_PAGES = ["/pos", "/repairs", "/items"];

export async function prepareOffline(dataUrls: string[], extraUrls: string[] = []): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller || typeof caches === "undefined") return false;
  try {
    const pages = await caches.open("mahar-pages");
    const html: string[] = [];
    for (const path of OFFLINE_PAGES) {
      const page = await fetch(path, { credentials: "same-origin" });
      if (!page.ok || page.redirected) {
        if (path === "/pos") return false;
        continue;
      }
      html.push(await page.clone().text());
      await pages.put(path, page);
    }

    const seen = new Set<string>();
    let queue = html.flatMap(staticAssetsIn);
    while (queue.length && seen.size < 400) {
      const batch = queue.filter((u) => !seen.has(u)).slice(0, 12);
      if (!batch.length) break;
      batch.forEach((u) => seen.add(u));
      const texts = await Promise.all(batch.map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`missing ${u}`);
        return u.endsWith(".js") ? r.text() : "";
      }));
      queue = [...queue.filter((u) => !seen.has(u)), ...texts.flatMap(staticAssetsIn)];
    }

    const data = await Promise.all(dataUrls.map((u) => fetch(u, { headers: { "x-mahar-offline": "1" } })));
    if (data.some((r) => !r.ok)) return false;
    // Repairs and the items list: kept when this user may see them; the till works without.
    await Promise.all(extraUrls.map((u) => fetch(u, { headers: { "x-mahar-offline": "1" } }).catch(() => null)));
    // The worker keeps a response after handing it over; give it a moment to finish.
    await new Promise((r) => setTimeout(r, 500));
    try { localStorage.setItem(READY_KEY, String(Date.now())); } catch {}
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useOfflineReadyAt(): number | null {
  return useSyncExternalStore(subscribe, offlineReadyAt, () => null);
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

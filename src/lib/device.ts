"use client";

// "This device only" shops: no account and no server. The shop's books live in this browser
// (Postgres in IndexedDB) and the app's API calls are answered by the device engine, the
// same server code running in a Web Worker (src/device/engine.ts, public/device/engine.js).

const KEY = "mahar-pos:device-shop";

export function isDeviceShop(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markDeviceShop() {
  try { localStorage.setItem(KEY, "1"); } catch {}
}

type Reply = { id: number; ok: boolean; error?: string; status?: number; text?: string; hasShop?: boolean };

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>();

const VERSION_KEY = "mahar-pos:device-engine";

function engineVersion(): string {
  try {
    return localStorage.getItem(VERSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function engine(): Worker {
  if (worker) return worker;
  worker = new Worker(`/device/engine.js?v=${engineVersion()}`, { type: "module", name: "mahar-device" });
  worker.addEventListener("message", (event: MessageEvent<Reply>) => {
    const w = waiting.get(event.data.id);
    if (!w) return;
    waiting.delete(event.data.id);
    if (event.data.ok) w.resolve(event.data);
    else w.reject(new Error(event.data.error || "The shop on this device could not answer"));
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "The shop on this device could not start");
    for (const w of waiting.values()) w.reject(error);
    waiting.clear();
    worker = null;
  });
  return worker;
}

function send(message: Record<string, unknown>): Promise<Reply> {
  const id = nextId++;
  return new Promise<Reply>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    engine().postMessage({ id, ...message });
  });
}

/** Answers an API call from the shop on this device, as the server would. */
export async function deviceFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const r = await send({ type: "api", method, path, body });
  return new Response(r.text ?? "", { status: r.status ?? 500, headers: { "content-type": "application/json" } });
}

/** Whether this device already holds a shop (opens the database, running any new migrations). */
export async function deviceHasShop(): Promise<boolean> {
  return Boolean((await send({ type: "status" })).hasShop);
}

export type DeviceShopInput = { businessName: string; ownerName: string; phone?: string; businessCategory?: string };

/** Creates the shop on this device: its books, cash wallet, categories and the owner. */
export async function createDeviceShop(input: DeviceShopInput) {
  await send({ type: "setup", input });
  markDeviceShop();
}

// ---- Backups ---------------------------------------------------------------------------------

const LAST_BACKUP_KEY = "mahar-pos:device-backup";
/** A reminder shows when the last backup is older than this. */
export const BACKUP_REMIND_DAYS = 7;

/** When the books were last backed up on this device (as the engine recorded it), or null. */
export async function deviceLastBackup(): Promise<number | null> {
  const r = (await send({ type: "status" })) as Reply & { lastBackupAt?: number | null };
  const at = r.lastBackupAt ?? null;
  try { localStorage.setItem(LAST_BACKUP_KEY, String(at ?? "")); } catch {}
  return at;
}

/** The last backup as last seen, without waking the engine (for reminders). */
export function lastBackupSeen(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** The shop's books as one file (a compressed copy of the whole database), named for the shop
 *  and the time. */
export async function makeDeviceBackup(): Promise<File> {
  const r = (await send({ type: "backup" })) as Reply & { file: Blob; shop: string; at: number };
  try { localStorage.setItem(LAST_BACKUP_KEY, String(r.at)); } catch {}
  const d = new Date(r.at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const shop = r.shop.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "shop";
  return new File([r.file], `mahar-pos-backup-${shop}-${stamp}.tar.gz`, { type: "application/gzip", lastModified: r.at });
}

/** Saves a file to the device's downloads. */
export function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether the phone can hand the file to another app (Telegram, Drive, Gmail). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === "function" && Boolean(navigator.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

/** Replaces the books on this device with a backup file. The file is checked first; a wrong one
 *  leaves the books as they are. The page should reload afterwards. */
export async function restoreDeviceBackup(file: File): Promise<{ shop: string; at: number | null }> {
  let r: Reply & { shop: string; at: number | null };
  try {
    r = (await send({ type: "restore", file })) as typeof r;
  } finally {
    // The engine may have closed its database: the next call starts a new one.
    worker?.terminate();
    worker = null;
  }
  markDeviceShop();
  try { localStorage.setItem(LAST_BACKUP_KEY, String(r.at ?? "")); } catch {}
  return { shop: r.shop, at: r.at };
}

// ---- Keeping the app on the device -------------------------------------------------------

const DEVICE_CACHE = "mahar-device";
const STAGING_CACHE = "mahar-device-next";
/** The service worker's mark that this browser holds a device shop (public/sw.js). */
const DEVICE_FLAG = "/__mahar-device";
const READY_KEY = "mahar-pos:device-ready";

type Manifest = { version: string; screens: string[]; files: { name: string; hash: string }[] };

/** The built files a page, script or screen's data names (/_next/static/…). */
function staticFiles(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~]+?\.(?:js|css|woff2?|png|svg|jpg|webp)/g)) {
    const path = m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`;
    if (!path.includes("..")) found.add(path);
  }
  return [...found];
}

async function keep(cache: Cache, key: string, response: Response, allowRedirect = false) {
  if (!response.ok || (response.redirected && !allowRedirect)) throw new Error(`Could not keep ${key} (${response.status})`);
  await cache.put(key, response);
}

/** Keeps every screen of the app, the files they load and the device engine on this device,
 *  so the shop opens and works without the internet. Needs the internet once (about 25 MB);
 *  run again while connected, it brings the app up to date (only what changed is fetched).
 *  The new copy is gathered apart and replaces the old one only once complete, so a dropped
 *  connection never leaves the shop with half an app. onProgress gets 0..1. */
export async function prepareDevice(onProgress?: (done: number) => void): Promise<void> {
  if (typeof caches === "undefined") throw new Error("This browser cannot keep the app for use without the internet");
  const manifest = (await (await fetch("/device/manifest.json", { cache: "no-store", headers: { "x-mahar-fresh": "1" } })).json()) as Manifest;
  const current = await caches.open(DEVICE_CACHE);
  await caches.delete(STAGING_CACHE);
  const next = await caches.open(STAGING_CACHE);
  const texts: string[] = [];
  const total = manifest.screens.length * 2 + manifest.files.length + 1;
  let done = 0;
  const step = () => onProgress?.(Math.min(0.99, ++done / (total + 60)));
  /** What this device already holds under that key (files that never change), else the network. */
  // Never through the service worker, which answers a device file with the kept one (any version).
  const reuse = async (key: string, url = key) =>
    (await current.match(key)) ?? (await fetch(url, { headers: { "x-mahar-fresh": "1" }, cache: "no-cache" }));

  // The engine and its large files (fetched again only when they change), then each screen
  // as a page and as the router's data.
  const engineUrl = `/device/engine.js?v=${manifest.version}`;
  await keep(next, engineUrl, await reuse(engineUrl));
  step();
  for (const f of manifest.files) {
    const key = `/device/${f.name}?h=${f.hash}`;
    // The hash in the address keeps the browser from giving an older copy of the file.
    await keep(next, key, await reuse(key));
    step();
  }
  for (let i = 0; i < manifest.screens.length; i += 6) {
    await Promise.all(manifest.screens.slice(i, i + 6).map(async (screen) => {
      // A fresh copy from the server, never one the service worker kept before.
      const page = await fetch(screen, { headers: { "x-mahar-fresh": "1" }, credentials: "same-origin", cache: "no-store" });
      texts.push(await page.clone().text());
      await keep(next, screen, page);
      step();
      const rsc = await fetch(screen, { headers: { RSC: "1", "x-mahar-fresh": "1" }, credentials: "same-origin", cache: "no-store" });
      texts.push(await rsc.clone().text());
      // Next sends the router to the same address with a check value (_rsc) first.
      await keep(next, "/__rsc" + screen, rsc, true);
      step();
    }));
  }

  // Every built file the screens load, following scripts that load others. Their names change
  // with their content, so one already kept is reused.
  const seen = new Set<string>();
  let queue = texts.flatMap(staticFiles);
  while (queue.length && seen.size < 1500) {
    const batch = [...new Set(queue.filter((u) => !seen.has(u)))].slice(0, 12);
    if (!batch.length) break;
    batch.forEach((u) => seen.add(u));
    const more = await Promise.all(batch.map(async (u) => {
      const r = await reuse(u);
      step();
      // A name found inside a script may not be a file of this build: nothing to keep.
      if (r.status === 404) return [];
      await keep(next, u, r.clone());
      return u.endsWith(".js") ? staticFiles(await r.text()) : [];
    }));
    queue = [...queue.filter((u) => !seen.has(u)), ...more.flat()];
  }

  // Complete: the new copy replaces the old one, and what the new one does not use goes.
  const keys = await next.keys();
  const kept = new Set(keys.map((k) => new URL(k.url).pathname + new URL(k.url).search));
  for (const k of keys) {
    const r = await next.match(k);
    if (r) await current.put(k, r);
  }
  for (const k of await current.keys()) {
    const u = new URL(k.url);
    if (u.pathname !== DEVICE_FLAG && !kept.has(u.pathname + u.search)) await current.delete(k);
  }
  await caches.delete(STAGING_CACHE);

  try {
    localStorage.setItem(VERSION_KEY, manifest.version);
    localStorage.setItem(READY_KEY, String(Date.now()));
  } catch {}
  // Ask the browser never to clear the shop's books to make room (it may still ask the user).
  await navigator.storage?.persist?.().catch(() => false);
  // From now on the service worker answers every screen from the device.
  const reg = await navigator.serviceWorker?.ready.catch(() => undefined);
  reg?.active?.postMessage({ type: "device" });
  onProgress?.(1);
}

/** With the internet, keeps the new version of the app when there is one (the next opening
 *  uses it). The shop's books are untouched; the engine updates the database itself. */
export async function refreshDeviceApp(): Promise<boolean> {
  const manifest = (await (await fetch("/device/manifest.json", { cache: "no-store", headers: { "x-mahar-fresh": "1" } })).json()) as Manifest;
  if (manifest.version === engineVersion()) return false;
  await prepareDevice();
  return true;
}

/** When this device last kept the app (prepareDevice), or null. */
export function deviceReadyAt(): number | null {
  try {
    const v = Number(localStorage.getItem(READY_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

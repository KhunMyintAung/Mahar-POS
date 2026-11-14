"use client";

import { api } from "./client";

// This device's system pop-ups (Web Push), from Settings → Account. The browser asks the
// person only when they press the button. The server keeps the subscription under the person
// signed in (src/app/api/v1/push/subscribe); signing out removes it from this device.

export type PushState =
  /** The browser has no Web Push. */
  | "unsupported"
  /** iPhone or iPad in Safari: push works only in the app added to the Home Screen (iOS 16.4+). */
  | "ios-install"
  /** The person blocked notifications for this site. */
  | "denied"
  | "off"
  | "on";

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function hasPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The app's service worker; registered here when the page has none yet (the development server). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios-install";
  if (!hasPush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

export class PushError extends Error {
  constructor(public reason: "denied" | "not-set-up" | "failed") {
    super(reason);
  }
}

/** Asks the browser (only now) and subscribes this device. */
export async function turnPushOn(): Promise<void> {
  if (!hasPush()) throw new PushError("failed");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushError(permission === "denied" ? "denied" : "failed");
  const { publicKey } = await api<{ publicKey: string | null }>("/api/v1/push/subscribe");
  if (!publicKey) throw new PushError("not-set-up");
  const reg = await registration();
  if (!reg) throw new PushError("failed");
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Kept from another server key: a new one is needed.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub = sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  await api("/api/v1/push/subscribe", { method: "POST", body: sub.toJSON() });
}

/** Stops this device's pop-ups, on the server and in the browser. */
export async function turnPushOff(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/api/v1/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint }, timeoutMs: 5000 }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

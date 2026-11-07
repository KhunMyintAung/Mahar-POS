"use client";

import { useSyncExternalStore } from "react";
import type { ReceiptData } from "@/components/SaleReceipt";

/** A sale rung up without the internet, kept on this device until it is sent. The server
 *  records it on the day it was made (offline.at) and once only (offline.clientRef). */
export interface QueuedSale {
  clientRef: string;
  /** When it was made at the till (ISO). */
  at: string;
  /** The body for POST /api/v1/sales, with date and offline set. */
  body: Record<string, unknown>;
  receipt: ReceiptData;
  /** In minor units (pya), as fmtMoney takes it. */
  total: number;
  /** failed: the server refused it (stock gone, day closed…); it waits for the cashier. */
  status: "pending" | "failed";
  error?: string;
}

const EVENT = "mahar-pos:offline-sales";
const key = (userId: string) => `mahar-pos:offline-sales:${userId}`;

export function listQueued(userId: string | undefined): QueuedSale[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(key(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(userId: string, list: QueuedSale[]) {
  localStorage.setItem(key(userId), JSON.stringify(list));
  cache.delete(userId);
  window.dispatchEvent(new Event(EVENT));
}

/** Keeps a sale on this device. Throws when the device has no room left, so the till says
 *  the sale was not kept rather than losing it. */
export function enqueueSale(userId: string, sale: QueuedSale) {
  save(userId, [...listQueued(userId), sale]);
}

export function removeQueued(userId: string, clientRef: string) {
  save(userId, listQueued(userId).filter((s) => s.clientRef !== clientRef));
}

function update(userId: string, clientRef: string, patch: Partial<QueuedSale>) {
  save(userId, listQueued(userId).map((s) => (s.clientRef === clientRef ? { ...s, ...patch } : s)));
}

// useSyncExternalStore needs the same array back while nothing changed.
const cache = new Map<string, { raw: string | null; list: QueuedSale[] }>();
function snapshot(userId: string | undefined): QueuedSale[] {
  if (!userId) return EMPTY;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key(userId)); } catch {}
  const hit = cache.get(userId);
  if (hit && hit.raw === raw) return hit.list;
  const list = listQueued(userId);
  cache.set(userId, { raw, list });
  return list;
}
const EMPTY: QueuedSale[] = [];

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function useQueuedSales(userId: string | undefined): QueuedSale[] {
  return useSyncExternalStore(subscribe, () => snapshot(userId), () => EMPTY);
}

export interface SyncResult { sent: number; failed: number; stopped: "offline" | "signed-out" | "server" | null }

let running: Promise<SyncResult> | null = null;

/** Sends the sales kept on this device, oldest first. A sale the server refuses is marked
 *  failed with its reason and the rest still go; no connection, a signed-out session or a
 *  server fault stops the run and leaves the rest for the next one. retryFailed sends the
 *  failed ones again too. */
export function syncQueued(userId: string, opts: { retryFailed?: boolean } = {}): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const result: SyncResult = { sent: 0, failed: 0, stopped: null };
    for (const sale of listQueued(userId)) {
      if (sale.status === "failed" && !opts.retryFailed) continue;
      let res: Response;
      try {
        res = await fetch("/api/v1/sales", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sale.body),
        });
      } catch {
        result.stopped = "offline";
        break;
      }
      if (res.status === 401) { result.stopped = "signed-out"; break; }
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        removeQueued(userId, sale.clientRef);
        result.sent++;
      } else if (res.status >= 500 || !data) {
        result.stopped = "server";
        break;
      } else {
        const detail = Array.isArray(data?.details) ? ": " + data.details.map((d: { message: string }) => d.message).join(", ") : "";
        update(userId, sale.clientRef, { status: "failed", error: (data?.error ?? `Request failed (${res.status})`) + detail });
        result.failed++;
      }
    }
    return result;
  })().finally(() => { running = null; });
  return running;
}

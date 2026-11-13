"use client";

import { useSyncExternalStore } from "react";
import { api } from "./client";
import { getNetMode, isNetworkError } from "./netMode";
import { isDeviceShop } from "./device";
import { BENCH_STATUSES, READY_STATUSES } from "./repairStatus";

// ---------------------------------------------------------------------------
// Repairs without the internet.
//
// In Sync later mode a repair change is sent at once, and kept on this device when the
// internet is gone; in Offline mode it is kept on this device first and sent on Sync now.
// Kept changes go to the server in the order they were made, each with its own clientRef
// (sent twice, recorded once) and the time it was made (the job and its money are dated
// then, not when the internet came back).
//
// A repair taken in without the internet takes the next number from a block of voucher
// numbers this device set aside while it was online, so its voucher carries the number it
// will keep. With the block used up the voucher says the number is still to come.
// ---------------------------------------------------------------------------

export type RepairOpKind = "create" | "status" | "pay" | "details";

export interface RepairOp {
  clientRef: string;
  /** When it was done on this device (ISO). */
  at: string;
  kind: RepairOpKind;
  /** The job: its id, or "local:<clientRef>" for one taken in on this device and not sent. */
  jobRef: string;
  body: Record<string, unknown>;
  /** A create's job as the list shows it until it is sent. */
  job?: LocalJob;
  /** failed: the server refused it (the job moved on elsewhere…); it waits to be checked. */
  status: "pending" | "failed";
  error?: string;
}

export interface ReservedNumber { blockId: string; n: number; jobNo: string }

/** The fields of a repair the list shows, as the server sends them (money in minor units). */
export interface LocalJob {
  id: string; jobNo: string; status: string; priority: string;
  customerName?: string; customerPhone?: string;
  deviceBrand: string; deviceModel: string; imei?: string;
  accessories?: string; problem: string; intakeCondition?: string; notes?: string;
  estimatedCost: string; partsCost: string; finalCost: string;
  depositAmount: string; paidAmount: string;
  receivedAt: string; deliveredAt?: string; promisedAt?: string | null;
  technicianName?: string | null; receivedByName?: string;
  cannotRepair?: boolean;
  /** Kept on this device, not on the server yet. */
  offline?: "pending" | "failed";
  offlineError?: string;
}

export const LOCAL = "local:";
export const isLocalJob = (id: string) => id.startsWith(LOCAL);
/** Shown for a repair taken in offline after the device's numbers ran out. */
export const NUMBER_TO_COME = "(number when sent)";

const EVENT = "mahar-pos:offline-repairs";
const opsKey = (userId: string) => `mahar-pos:offline-repairs:${userId}`;
const poolKey = (userId: string) => `mahar-pos:repair-numbers:${userId}`;
const DEVICE_KEY = "mahar-pos:device-id";
/** Fewer numbers than this left: set aside another block when there is internet. */
const LOW = 5;
const BLOCK = 20;

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(key: string, list: unknown[]) {
  localStorage.setItem(key, JSON.stringify(list));
  cache.clear();
  window.dispatchEvent(new Event(EVENT));
}

export const listRepairOps = (userId: string | undefined): RepairOp[] => (userId ? read<RepairOp>(opsKey(userId)) : []);
const saveOps = (userId: string, ops: RepairOp[]) => write(opsKey(userId), ops);
export const reservedNumbers = (userId: string | undefined): ReservedNumber[] => (userId ? read<ReservedNumber>(poolKey(userId)) : []);

export function newRef(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** This device's own name, so the shop can see which device set numbers aside. */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newRef();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return newRef();
  }
}

/** The kept changes work only in the installed app's Sync later and Offline modes. */
export function keepsRepairs(): boolean {
  return !isDeviceShop() && getNetMode() !== "online";
}

let toppingUp: Promise<void> | null = null;

/** While online, sets aside the next block of voucher numbers when few are left. */
export function topUpNumbers(userId: string): Promise<void> {
  if (toppingUp) return toppingUp;
  if (!keepsRepairs() || reservedNumbers(userId).length >= LOW) return Promise.resolve();
  toppingUp = (async () => {
    try {
      const block = await api<{ blockId: string; numbers: { n: number; jobNo: string }[] }>("/api/v1/repairs/numbers", {
        method: "POST",
        body: { deviceId: deviceId(), count: BLOCK },
        timeoutMs: 10_000,
      });
      write(poolKey(userId), [...reservedNumbers(userId), ...block.numbers.map((x) => ({ blockId: block.blockId, ...x }))]);
    } catch {
      // No internet or no right to take in repairs: the numbers come when the job is sent.
    }
  })().finally(() => { toppingUp = null; });
  return toppingUp;
}

function takeNumber(userId: string): ReservedNumber | null {
  const [first, ...rest] = reservedNumbers(userId);
  if (!first) return null;
  write(poolKey(userId), rest);
  return first;
}

const minor = (v: unknown) => String(Math.round(Number(v || 0) * 100));

/** The job a create body describes, as the list shows it until it is sent. */
export function localJobFrom(ref: string, body: Record<string, unknown>, at: string, jobNo: string, by?: string): LocalJob {
  const s = (k: string) => (typeof body[k] === "string" && body[k] ? (body[k] as string) : undefined);
  const deposit = minor(body.depositAmount);
  return {
    id: LOCAL + ref,
    jobNo,
    status: "RECEIVED",
    priority: s("priority") ?? "NORMAL",
    customerName: s("customerName"),
    customerPhone: s("customerPhone"),
    deviceBrand: s("deviceBrand") ?? "",
    deviceModel: s("deviceModel") ?? "",
    imei: s("imei"),
    accessories: s("accessories"),
    problem: s("problem") ?? "",
    intakeCondition: s("intakeCondition"),
    notes: s("notes"),
    estimatedCost: minor(body.estimatedCost),
    partsCost: "0",
    finalCost: "0",
    depositAmount: deposit,
    paidAmount: deposit,
    receivedAt: at,
    promisedAt: s("promisedAt") ?? null,
    technicianName: s("technicianName") ?? null,
    receivedByName: by,
    offline: "pending",
  };
}

/** One kept change applied to a job, so the list shows it as it will be once sent. */
export function applyOp<J extends LocalJob>(job: J, op: RepairOp): J {
  const b = op.body;
  const next: J = { ...job, offline: op.status, offlineError: op.error ?? job.offlineError };
  if (op.kind === "status") {
    const status = String(b.status);
    next.status = status;
    if (b.finalCost !== undefined) next.finalCost = minor(b.finalCost);
    if (b.partsCost !== undefined) next.partsCost = minor(b.partsCost);
    if (status === "DELIVERED") {
      next.deliveredAt = op.at;
      // Handing it back takes the balance (or marks it taken, record only).
      next.paidAmount = String(Math.max(Number(next.finalCost), Number(next.paidAmount)));
    }
    if (status === "CANNOT_REPAIR") next.cannotRepair = true;
    else if (BENCH_STATUSES.includes(status as never)) next.cannotRepair = false;
  } else if (op.kind === "pay") {
    if (b.finalCost !== undefined) next.finalCost = minor(b.finalCost);
    if (b.partsCost !== undefined) next.partsCost = minor(b.partsCost);
    next.paidAmount = next.finalCost;
  } else if (op.kind === "details") {
    for (const [k, v] of Object.entries(b)) {
      if (k === "offline" || v === undefined) continue;
      if (k === "estimatedCost") next.estimatedCost = minor(v);
      else (next as Record<string, unknown>)[k] = v === "" ? undefined : v;
    }
  }
  return next;
}

/** The list with this device's kept changes on it: repairs taken in here first, then every
 *  change in the order it was made. */
export function overlay<J extends LocalJob>(jobs: J[], ops: RepairOp[]): J[] {
  if (!ops.length) return jobs;
  const local = ops.filter((o) => o.kind === "create" && o.job).map((o) => ({ ...o.job!, offline: o.status, offlineError: o.error }) as J);
  const byId = new Map<string, J>([...local, ...jobs].map((j) => [j.id, j]));
  for (const op of ops) {
    if (op.kind === "create") continue;
    const job = byId.get(op.jobRef);
    if (job) byId.set(op.jobRef, applyOp(job, op));
  }
  return [...local.map((j) => byId.get(j.id)!), ...jobs.map((j) => byId.get(j.id)!)];
}

/** The list's filters, worked out on this device for a kept list (no internet to ask). */
export function filterJobs<J extends LocalJob>(jobs: J[], f: { q?: string; status?: string; month?: string }): J[] {
  const q = f.q?.trim().toLowerCase();
  return jobs.filter((j) => {
    if (q && ![j.jobNo, j.customerName, j.customerPhone, j.deviceBrand, j.deviceModel, j.imei].some((v) => v?.toLowerCase().includes(q))) return false;
    if (f.month && !q && monthOf(j.receivedAt) !== f.month) return false;
    switch (f.status) {
      case undefined: case "": return true;
      case "WORKING": return BENCH_STATUSES.includes(j.status as never);
      case "READY": return READY_STATUSES.includes(j.status as never);
      case "UNPAID": return j.status === "DONE" && Number(j.paidAmount) === 0;
      case "RETURNED_UNFIXED": return j.status === "DELIVERED" && Boolean(j.cannotRepair);
      default: return j.status === f.status;
    }
  });
}

export function monthOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The counts above the list, for a month, from a kept list. */
export function summarize(jobs: LocalJob[], month: string) {
  const inMonth = jobs.filter((j) => monthOf(j.receivedAt) === month);
  const count = (statuses: readonly string[]) => inMonth.filter((j) => statuses.includes(j.status)).length;
  return {
    total: inMonth.length,
    inWorkflow: count(BENCH_STATUSES),
    completed: count(READY_STATUSES),
    cannotRepair: count(["CANNOT_REPAIR"]),
    delivered: count(["DELIVERED"]),
    unpaid: inMonth.filter((j) => j.status === "DONE" && Number(j.paidAmount) === 0).length,
    month,
  };
}

const PATHS: Record<RepairOpKind, (id: string) => { path: string; method: string }> = {
  create: () => ({ path: "/api/v1/repairs", method: "POST" }),
  status: (id) => ({ path: `/api/v1/repairs/${id}`, method: "PATCH" }),
  pay: (id) => ({ path: `/api/v1/repairs/${id}/pay`, method: "POST" }),
  details: (id) => ({ path: `/api/v1/repairs/${id}/details`, method: "PATCH" }),
};

export interface RepairResult<T> {
  /** The job as the server returned it, or as this device shows it until it is sent. */
  job: T;
  /** Kept on this device (no internet, or Offline mode). */
  kept: boolean;
}

/** Takes a repair in, changes its status, takes its money or corrects it: sent at once when
 *  the mode and the internet allow, kept on this device otherwise. */
export async function repairAction<T extends LocalJob>(
  userId: string | undefined,
  kind: RepairOpKind,
  jobRef: string,
  body: Record<string, unknown>,
  opts: { current?: T; by?: string } = {},
): Promise<RepairResult<T>> {
  const at = new Date().toISOString();
  const clientRef = newRef();
  if (!userId || !keepsRepairs()) {
    const { path, method } = PATHS[kind](jobRef);
    return { job: await api<T>(path, { method, body }), kept: false };
  }
  // A job not sent yet, or one with changes still waiting, keeps its order: this waits too.
  const waiting = listRepairOps(userId).some((o) => o.jobRef === jobRef || (o.kind === "create" && LOCAL + o.clientRef === jobRef));
  if (getNetMode() === "sync" && !waiting && !isLocalJob(jobRef)) {
    const { path, method } = PATHS[kind](jobRef);
    try {
      const job = await api<T>(path, { method, body: { ...body, offline: { clientRef, at } }, timeoutMs: 8000 });
      if (kind === "create") topUpNumbers(userId).catch(() => {});
      return { job, kept: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      // Kept with the same clientRef: if the server did get it, sending it again records nothing new.
    }
  }
  const op: RepairOp = { clientRef, at, kind, jobRef, body, status: "pending" };
  let shown: T;
  if (kind === "create") {
    const number = takeNumber(userId);
    if (number) op.body = { ...body, offlineNumber: { blockId: number.blockId, n: number.n } };
    op.jobRef = LOCAL + clientRef;
    op.job = localJobFrom(clientRef, body, at, number?.jobNo ?? NUMBER_TO_COME, opts.by);
    shown = op.job as T;
  } else {
    shown = opts.current ? applyOp(opts.current, op) : ({ id: jobRef } as T);
  }
  saveOps(userId, [...listRepairOps(userId), op]);
  return { job: shown, kept: true };
}

/** Takes back a repair taken in on this device before it was sent, with its later changes. */
export function discardLocalRepair(userId: string, localId: string) {
  saveOps(userId, listRepairOps(userId).filter((o) => o.jobRef !== localId));
}

export interface RepairSyncResult { sent: number; failed: number; stopped: "offline" | "signed-out" | "server" | null }

let running: Promise<RepairSyncResult> | null = null;

/** Sends the kept changes, oldest first. A change the server refuses is marked failed with
 *  its reason, and the later changes of that same job wait behind it; the other jobs still
 *  go. No connection, a signed-out session or a server fault stops the run. */
export function syncRepairs(userId: string, opts: { retryFailed?: boolean } = {}): Promise<RepairSyncResult> {
  if (running) return running;
  running = (async () => {
    const result: RepairSyncResult = { sent: 0, failed: 0, stopped: null };
    const blocked = new Set<string>();
    for (const first of listRepairOps(userId)) {
      // Read afresh: a create sent earlier in this run has given its job an id.
      const op = listRepairOps(userId).find((o) => o.clientRef === first.clientRef);
      if (!op) continue;
      if (blocked.has(op.jobRef) || (op.status === "failed" && !opts.retryFailed)) {
        blocked.add(op.jobRef);
        continue;
      }
      if (op.kind !== "create" && isLocalJob(op.jobRef)) { blocked.add(op.jobRef); continue; }
      const { offlineNumber, ...rest } = op.body;
      const { path, method } = PATHS[op.kind](op.jobRef);
      let res: Response;
      try {
        res = await fetch(path, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...rest, offline: { clientRef: op.clientRef, at: op.at, ...(op.kind === "create" && offlineNumber ? { number: offlineNumber } : {}) } }),
        });
      } catch {
        result.stopped = "offline";
        break;
      }
      if (res.status === 401) { result.stopped = "signed-out"; break; }
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        const ops = listRepairOps(userId).filter((o) => o.clientRef !== op.clientRef);
        // The job taken in here has its id now: its later changes go to it.
        const id = op.kind === "create" ? (data.data as { id?: string })?.id : undefined;
        saveOps(userId, id ? ops.map((o) => (o.jobRef === op.jobRef ? { ...o, jobRef: id } : o)) : ops);
        result.sent++;
      } else if (res.status >= 500 || !data) {
        result.stopped = "server";
        break;
      } else {
        const detail = Array.isArray(data?.details) ? ": " + data.details.map((d: { message: string }) => d.message).join(", ") : "";
        const error = (data?.error ?? `Request failed (${res.status})`) + detail;
        saveOps(userId, listRepairOps(userId).map((o) => (o.clientRef === op.clientRef ? { ...o, status: "failed", error } : o)));
        blocked.add(op.jobRef);
        result.failed++;
      }
    }
    if (!result.stopped) await topUpNumbers(userId);
    return result;
  })().finally(() => { running = null; });
  return running;
}

/** Drops a change the server refused, after the staff have checked it. */
export function dropRepairOp(userId: string, clientRef: string) {
  const op = listRepairOps(userId).find((o) => o.clientRef === clientRef);
  if (!op) return;
  // A repair taken in here that is dropped takes its later changes with it.
  saveOps(userId, listRepairOps(userId).filter((o) => o.clientRef !== clientRef && !(op.kind === "create" && o.jobRef === op.jobRef)));
}

// useSyncExternalStore needs the same array back while nothing changed.
const cache = new Map<string, { raw: string | null; list: RepairOp[] }>();
const EMPTY: RepairOp[] = [];
function snapshot(userId: string | undefined): RepairOp[] {
  if (!userId) return EMPTY;
  let raw: string | null = null;
  try { raw = localStorage.getItem(opsKey(userId)); } catch {}
  const hit = cache.get(userId);
  if (hit && hit.raw === raw) return hit.list;
  const list = listRepairOps(userId);
  cache.set(userId, { raw, list });
  return list;
}

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function useRepairOps(userId: string | undefined): RepairOp[] {
  return useSyncExternalStore(subscribe, () => snapshot(userId), () => EMPTY);
}

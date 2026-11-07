// The device engine: the shop's server, running in a Web Worker on this phone or computer for
// "This device only" shops. The same API routes, services and database schema as
// app.maharpos.shop, on Postgres in the browser (PGlite, kept in IndexedDB). Nothing leaves
// the device. Built by scripts/build-device.mjs into public/device/engine.js.
import { NextRequest } from "next/server";
import { pglite } from "./prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { registerTenant } from "@/lib/tenant";
import { deviceRequest } from "./shims/next-headers";
// Generated at build time: every API route and every migration.
import { routes } from "device:routes";
import { migrations } from "device:migrations";

type RouteModule = Record<string, unknown>;
type Route = { segments: string[]; mod: RouteModule };

const ORIGIN = self.location.origin;
const table: Route[] = (routes as { path: string; mod: RouteModule }[])
  .map((r) => ({ segments: r.path.split("/"), mod: r.mod }))
  // Fixed segments before [params], so /items/bulk wins over /items/[id].
  .sort((a, b) => dynamicCount(a.segments) - dynamicCount(b.segments));

function dynamicCount(segments: string[]) {
  return segments.filter((s) => s.startsWith("[")).length;
}

function match(pathname: string): { mod: RouteModule; params: Record<string, string | string[]> } | null {
  const parts = pathname.replace(/^\/api\//, "").split("/").filter(Boolean).map(decodeURIComponent);
  for (const route of table) {
    const params: Record<string, string | string[]> = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith("[...")) {
        params[seg.slice(4, -1)] = parts.slice(i);
        if (parts.length <= i) ok = false;
        break;
      }
      if (i >= parts.length) { ok = false; break; }
      if (seg.startsWith("[")) params[seg.slice(1, -1)] = parts[i];
      else if (seg !== parts[i]) { ok = false; break; }
      if (i === route.segments.length - 1 && parts.length !== route.segments.length) ok = false;
    }
    if (ok) return { mod: route.mod, params };
  }
  return null;
}

// ---- Database: migrations and the device's own settings ------------------------------------

async function migrate() {
  await pglite.exec(`CREATE TABLE IF NOT EXISTS "_device_migrations" (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "_device_meta" (key text PRIMARY KEY, value text NOT NULL);`);
  const done = new Set((await pglite.query<{ name: string }>(`SELECT name FROM "_device_migrations"`)).rows.map((r) => r.name));
  for (const m of migrations as { name: string; sql: string }[]) {
    if (done.has(m.name)) continue;
    await pglite.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query(`INSERT INTO "_device_migrations" (name) VALUES ($1)`, [m.name]);
    });
  }
}

async function meta(key: string): Promise<string | null> {
  const r = await pglite.query<{ value: string }>(`SELECT value FROM "_device_meta" WHERE key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}

async function setMeta(key: string, value: string) {
  await pglite.query(`INSERT INTO "_device_meta" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`, [key, value]);
}

// The shop's owner is always signed in on this device: there is no one else to keep out but
// whoever holds the phone, which the phone's own lock is for.
async function signIn(userId: string) {
  const { token } = await createSession(userId, { userAgent: "This device" });
  await setMeta("session", token);
  deviceRequest.cookies.set(SESSION_COOKIE, token);
}

/** How far the engine got starting up, for a page asking why it is slow. */
let stage = "loaded";
let booted: Promise<void> | null = null;
function boot() {
  booted ??= (async () => {
    stage = "opening database";
    await pglite.waitReady;
    stage = "updating database";
    await migrate();
    stage = "ready";
    const token = await meta("session");
    if (token) deviceRequest.cookies.set(SESSION_COOKIE, token);
  })();
  return booted;
}

async function setup(input: { businessName: string; ownerName: string; businessCategory?: string; phone?: string }) {
  await boot();
  if (await meta("owner")) throw new Error("This device already has a shop");
  const { owner } = await registerTenant({
    businessName: input.businessName,
    ownerName: input.ownerName,
    username: "owner",
    email: "owner@this-device.local",
    phone: input.phone,
    // Never typed: the owner is signed in by the device itself.
    password: crypto.randomUUID(),
    currency: "MMK",
    timezone: "Asia/Yangon",
    businessCategory: (input.businessCategory as "MOBILE_SHOP") ?? "ALL_IN_ONE",
  } as Parameters<typeof registerTenant>[0]);
  await setMeta("owner", owner.id);
  await signIn(owner.id);
}

async function callApi(method: string, path: string, body: unknown): Promise<{ status: number; text: string }> {
  await boot();
  const url = new URL(path, ORIGIN);
  const found = match(url.pathname);
  if (!found) return notAvailable();
  const handler = found.mod[method.toUpperCase()] as
    | ((req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>)
    | undefined;
  if (typeof handler !== "function") return notAvailable();
  const req = new NextRequest(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve(found.params) });
  return { status: res.status, text: await res.text() };
}

function notAvailable() {
  return {
    status: 404,
    text: JSON.stringify({ ok: false, error: "Not available in This device only mode. It needs an online account." }),
  };
}

// ---- Messages from the page --------------------------------------------------------------

type Message =
  | { id: number; type: "status" }
  | { id: number; type: "stage" }
  | { id: number; type: "setup"; input: Parameters<typeof setup>[0] }
  | { id: number; type: "api"; method: string; path: string; body?: unknown };

// One copy of the database open at a time: a second tab waits until the first one closes.
const opened = new Promise<void>((resolve) => {
  if (!("locks" in navigator)) return resolve();
  navigator.locks.request("mahar-device-db", () => {
    resolve();
    return new Promise(() => {});
  });
});

self.addEventListener("message", async (event: MessageEvent<Message>) => {
  const msg = event.data;
  const reply = (data: unknown) => (self as unknown as Worker).postMessage({ id: msg.id, ...(data as object) });
  if (msg.type === "stage") return reply({ ok: true, stage });
  try {
    stage = stage === "loaded" ? "waiting for another tab" : stage;
    await opened;
    if (msg.type === "status") {
      await boot();
      reply({ ok: true, hasShop: Boolean(await meta("owner")) });
    } else if (msg.type === "setup") {
      await setup(msg.input);
      reply({ ok: true });
    } else if (msg.type === "api") {
      reply({ ok: true, ...(await callApi(msg.method, msg.path, msg.body)) });
    }
  } catch (error) {
    console.error("[device]", error);
    reply({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

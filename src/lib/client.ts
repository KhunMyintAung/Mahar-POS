"use client";

// Small fetch wrapper for the app's own API. Throws Error with a friendly message.

import { getNetMode } from "./netMode";

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  /** timeoutMs: give up after this long; the failure is then a network error (TypeError). */
  opts?: { method?: string; body?: unknown; timeoutMs?: number }
): Promise<T> {
  const method = opts?.method ?? "GET";
  const headers: Record<string, string> = {};
  if (opts?.body !== undefined) headers["content-type"] = "application/json";
  // Unless the till is set to online only, a read is kept by the service worker so the app
  // still opens, with the last data it had, when the internet is gone: in sync mode the
  // network is asked first (briefly), in offline mode the kept copy answers at once.
  const mode = getNetMode();
  if (method === "GET" && mode !== "online") headers["x-mahar-offline"] = mode === "offline" ? "cache" : "1";
  const controller = opts?.timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), opts!.timeoutMs) : undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller?.signal,
    });
  } catch (error) {
    if (controller?.signal.aborted) throw new TypeError("The connection is too slow");
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops the signed-out state
    location.href = "/login";
    throw new ApiClientError("Not signed in", 401);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const msg = data?.error ?? `Request failed (${res.status})`;
    const detail = Array.isArray(data?.details)
      ? ": " + data.details.map((d: { message: string }) => d.message).join(", ")
      : "";
    throw new ApiClientError(msg + detail, res.status, data?.details);
  }
  return data.data as T;
}

"use client";

// Small fetch wrapper for the app's own API. Throws Error with a friendly message.

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method ?? "GET",
    headers: opts?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
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

import { request } from "node:http";
import { connect, type TLSSocket } from "node:tls";

// ---------------------------------------------------------------------------
// The Outline VPN server's management API, for the one shop that sells VPN keys on its bot.
//
// OUTLINE_API_URL is the management address Outline Manager shows (https://ip:port/secret);
// it gives full control of the server, so it stays in the server's environment and is never
// stored, logged or sent anywhere. The server's certificate is its own, not from a public
// authority, so instead of a normal check its SHA-256 fingerprint (OUTLINE_CERT_SHA256, also
// shown by Outline Manager) is compared on every call: a different server gets nothing.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 15_000;

export class OutlineError extends Error {}

export function outlineConfigured(): boolean {
  return Boolean(process.env.OUTLINE_API_URL && process.env.OUTLINE_CERT_SHA256);
}

const fingerprint = (s: string) => s.replace(/[^0-9a-f]/gi, "").toUpperCase();

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = process.env.OUTLINE_API_URL;
  const pinned = fingerprint(process.env.OUTLINE_CERT_SHA256 ?? "");
  if (!base || pinned.length !== 64) throw new OutlineError("Outline is not set up on this server");
  const url = new URL(base.replace(/\/+$/, "") + path);
  const payload = body === undefined ? undefined : JSON.stringify(body);

  // The address holds the secret, so the connection is made and its certificate checked first;
  // only then is the request written to it.
  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const s = connect({ host: url.hostname, port: Number(url.port || 443), rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
      const cert = s.getPeerCertificate();
      if (!cert?.fingerprint256 || fingerprint(cert.fingerprint256) !== pinned) {
        s.destroy();
        reject(new OutlineError("Outline server certificate does not match"));
      } else resolve(s);
    });
    s.on("timeout", () => s.destroy(new OutlineError("Outline did not answer in time")));
    s.on("error", (e) => reject(e instanceof OutlineError ? e : new OutlineError(e.message)));
  });

  return new Promise<T>((resolve, reject) => {
    const req = request({
      host: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      createConnection: () => socket,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) return reject(new OutlineError(`Outline ${method} ${path.split("/")[1]} failed (${status})`));
        try { resolve((text ? JSON.parse(text) : {}) as T); } catch { reject(new OutlineError("Outline sent an unreadable answer")); }
      });
    });
    req.on("timeout", () => req.destroy(new OutlineError("Outline did not answer in time")));
    req.on("error", (e) => reject(e instanceof OutlineError ? e : new OutlineError(e.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

export interface OutlineKey { id: string; name: string; accessUrl: string }

/** A new key, named so the shop can find it in Outline Manager, held to a data limit if any. */
export async function createOutlineKey(name: string, limitBytes: bigint | null): Promise<OutlineKey> {
  const key = await call<OutlineKey>("POST", "/access-keys", {});
  try {
    await call("PUT", `/access-keys/${encodeURIComponent(key.id)}/name`, { name });
    if (limitBytes != null) await setOutlineLimit(key.id, limitBytes);
  } catch (e) {
    // Half made is worse than not made: a key without its limit would be unlimited.
    await deleteOutlineKey(key.id).catch(() => {});
    throw e;
  }
  return { ...key, name };
}

export async function setOutlineLimit(id: string, bytes: bigint): Promise<void> {
  await call("PUT", `/access-keys/${encodeURIComponent(id)}/data-limit`, { limit: { bytes: Number(bytes) } });
}

export async function removeOutlineLimit(id: string): Promise<void> {
  await call("DELETE", `/access-keys/${encodeURIComponent(id)}/data-limit`);
}

export async function deleteOutlineKey(id: string): Promise<void> {
  await call("DELETE", `/access-keys/${encodeURIComponent(id)}`);
}

/** Every key's connection address, by key id. */
export async function outlineAccessUrls(): Promise<Map<string, string>> {
  const { accessKeys } = await call<{ accessKeys: OutlineKey[] }>("GET", "/access-keys");
  return new Map(accessKeys.map((k) => [k.id, k.accessUrl]));
}

/** Bytes each key has used, by key id. */
export async function outlineUsage(): Promise<Map<string, number>> {
  const { bytesTransferredByUserId } = await call<{ bytesTransferredByUserId: Record<string, number> }>("GET", "/metrics/transfer");
  return new Map(Object.entries(bytesTransferredByUserId ?? {}));
}

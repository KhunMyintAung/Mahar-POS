import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

/** A shop's own OpenAI or Gemini key for its Telegram AI helper.
 *
 *  Stored with AES-256-GCM under a key derived from AUTH_SECRET, so a copy of the database
 *  alone does not give the keys away. Each shop pays its own provider; we only hold the key
 *  to make the calls it asks for. */

export type AiProvider = "OPENAI" | "GEMINI";

/** OpenAI keys start "sk-", Google AI Studio keys "AIza". */
export function detectProvider(key: string): AiProvider | null {
  const k = key.trim();
  if (/^sk-[A-Za-z0-9_-]{20,}$/.test(k)) return "OPENAI";
  if (/^AIza[A-Za-z0-9_-]{30,}$/.test(k)) return "GEMINI";
  return null;
}

export const PROVIDER_NAME: Record<AiProvider, string> = { OPENAI: "OpenAI", GEMINI: "Gemini" };

function cipherKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`telegram-ai-key:${secret}`).digest();
}

/** "iv.tag.ciphertext", each base64url. */
export function encryptKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptKey(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", cipherKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export async function saveAiKey(userId: string, provider: AiProvider, key: string) {
  const data = { provider, encryptedKey: encryptKey(key.trim()), keyHint: key.trim().slice(-4) };
  await prisma.telegramAiKey.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function loadAiKey(userId: string): Promise<{ provider: AiProvider; key: string; hint: string } | null> {
  const row = await prisma.telegramAiKey.findUnique({ where: { userId } });
  if (!row) return null;
  try {
    return { provider: row.provider as AiProvider, key: decryptKey(row.encryptedKey), hint: row.keyHint };
  } catch {
    // AUTH_SECRET changed: the key can no longer be read, so it has to be entered again.
    return null;
  }
}

export async function removeAiKey(userId: string) {
  await prisma.telegramAiKey.deleteMany({ where: { userId } });
}

// Web Push for the device engine: a shop kept on this device only has no server to send
// pop-ups from, so nothing is sent (src/lib/pushSend.ts on the server).
import type { PushAudience, PushNotice } from "@/lib/pushSend";

export type { PushAudience, PushNotice };

export async function sendPush(...args: [businessId: string, notice: PushNotice, audience?: PushAudience]) {
  void args;
  return { sent: 0, removed: 0 };
}

export function vapidPublicKey(): string | null {
  return null;
}

export function noticeToPush(text: string, url?: string): PushNotice {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return { title: lines[0] ?? "Mahar POS", body: lines.slice(1).join("\n"), url };
}

import webpush from "web-push";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// The shop's notices as system pop-ups (Web Push): the same small window a browser shows for
// any site, on Windows, macOS and Android, even with the app's tab closed, while the browser
// or the installed app runs. Each device that turned it on in Settings → Account has a
// PushSubscription; public/sw.js shows what is sent.
//
// The keys are the server's (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in its env).
// Without them nothing is sent and the settings card says notifications are not set up.
//
// Like the Telegram feed, sending never holds up or fails what the shop just did: callers do
// not await it, and every failure is caught here.
// ---------------------------------------------------------------------------

export interface PushNotice {
  title: string;
  body: string;
  /** The app screen the pop-up opens, a path on this site ("/repairs"). */
  url?: string;
}

export interface PushAudience {
  /** Only people whose role has this permission. */
  perm?: string;
  /** Only the shop's owners (the Owner role). */
  ownersOnly?: boolean;
  /** Not this person: the one who just did it. */
  exceptUserId?: string;
  /** Only this person (the settings card's test). */
  onlyUserId?: string;
}

/** The server's push keys, or null when they are not set. */
function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || "https://app.maharpos.shop";
  return { publicKey, privateKey, subject };
}

/** The key a browser subscribes with, or null when push is not set up on this server. */
export function vapidPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

// A push message holds at most about 4 KB, and a pop-up shows a few lines.
const TITLE_MAX = 80;
const BODY_MAX = 300;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Only a path on this site: never another address in a pop-up. */
function safePath(url?: string) {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

function allowed(role: { name: string; permissions: string }, audience: PushAudience) {
  if (audience.ownersOnly && role.name !== "Owner") return false;
  if (!audience.perm || role.name === "Owner") return true;
  try {
    return (JSON.parse(role.permissions) as string[]).includes(audience.perm);
  } catch {
    return false;
  }
}

/** Sends a notice to every device of the shop's people who may see it. A device the push
 *  service no longer knows (404, 410: the browser dropped it or the user turned it off) is
 *  removed. Resolves to how many were sent and removed; never throws. */
export async function sendPush(businessId: string, notice: PushNotice, audience: PushAudience = {}): Promise<{ sent: number; removed: number }> {
  const done = { sent: 0, removed: 0 };
  const keys = vapid();
  if (!keys) return done;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { businessId, ...(audience.onlyUserId ? { userId: audience.onlyUserId } : {}) } });
    if (subs.length === 0) return done;
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(subs.map((s) => s.userId))] }, businessId, active: true, deletedAt: null },
      select: { id: true, role: { select: { name: true, permissions: true } } },
    });
    const who = new Set(users.filter((u) => u.id !== audience.exceptUserId && allowed(u.role, audience)).map((u) => u.id));
    const payload = JSON.stringify({
      title: cut(notice.title.trim() || "Mahar POS", TITLE_MAX),
      body: cut(notice.body.trim(), BODY_MAX),
      url: safePath(notice.url),
    });
    await Promise.all(subs.filter((s) => who.has(s.userId)).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 6 * 60 * 60, urgency: "high", vapidDetails: keys },
        );
        done.sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date() } }).catch(() => {});
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: s.id } }).catch(() => {});
          done.removed++;
        } else {
          console.error(`[push] send failed (${status ?? "no status"})`);
        }
      }
    }));
  } catch (e) {
    console.error("[push] failed:", e);
  }
  return done;
}

/** A Telegram-style notice (title line, then details) as a pop-up's title and text. */
export function noticeToPush(text: string, url?: string): PushNotice {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return { title: lines[0] ?? "Mahar POS", body: lines.slice(1).join("\n"), url };
}

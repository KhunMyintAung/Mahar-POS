import { prisma } from "./prisma";
import { mailEnabled, renderBroadcast, sendMail } from "./mail";

/** The admin portal's email desk: who can be written to, Resend's view of the sending
 *  domain and of each email, and broadcasts sent in the background. */

export type Audience = "owners" | "users" | "custom";

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** Addresses for an audience, de-duplicated. Owners are each shop's Owner accounts;
 *  users are every switched-on account with an email. */
export async function audienceEmails(audience: Audience, custom: string[] = []): Promise<string[]> {
  if (audience === "custom") {
    return [...new Set(custom.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
  }
  const users = await prisma.user.findMany({
    where: { deletedAt: null, active: true, email: { not: null }, ...(audience === "owners" ? { role: { name: "Owner" } } : {}) },
    select: { email: true },
  });
  return [...new Set(users.map((u) => u.email!.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}

async function resend(path: string) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  return res.json();
}

/** Sending domains and whether Resend has verified them. */
export async function resendDomains(): Promise<{ name: string; status: string }[]> {
  if (!mailEnabled()) return [];
  try {
    const d = (await resend("/domains")) as { data?: { name: string; status: string }[] };
    return (d.data ?? []).map((x) => ({ name: x.name, status: x.status }));
  } catch {
    return [];
  }
}

/** Asks Resend for the latest event of recent emails still in motion (sent or delivered,
 *  last 7 days), a few at a time to stay inside its rate limit. */
export async function refreshStatuses(limit = 40): Promise<number> {
  if (!mailEnabled()) return 0;
  const rows = await prisma.emailLog.findMany({
    where: { resendId: { not: null }, status: { in: ["SENT", "delivered", "sent", "delivery_delayed"] }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, resendId: true, status: true },
  });
  let changed = 0;
  for (const row of rows) {
    try {
      const e = (await resend(`/emails/${row.resendId}`)) as { last_event?: string };
      if (e.last_event && e.last_event !== row.status) {
        await prisma.emailLog.update({ where: { id: row.id }, data: { status: e.last_event } });
        changed++;
      }
    } catch {
      // Leave it for the next refresh.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return changed;
}

/** Sends a broadcast one person at a time in the background, updating its counts as it
 *  goes. Stops early if Resend says the daily quota is used up. */
export function runBroadcast(broadcastId: string, subject: string, body: string, emails: string[]) {
  const { html, text } = renderBroadcast(subject, body);
  (async () => {
    await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { status: "SENDING", recipients: emails.length } });
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await sendMail({ to, subject, html, text, kind: "BROADCAST", broadcastId });
        sent++;
      } catch (e) {
        failed++;
        if (e instanceof Error && e.message.includes(" 429")) {
          await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { sent, failed, status: "STOPPED", finishedAt: new Date() } });
          return;
        }
      }
      if ((sent + failed) % 5 === 0) await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { sent, failed } });
      await new Promise((r) => setTimeout(r, 550)); // Resend allows about 2 a second
    }
    await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { sent, failed, status: "DONE", finishedAt: new Date() } });
  })().catch((e) => console.error("[broadcast]", broadcastId, e));
}

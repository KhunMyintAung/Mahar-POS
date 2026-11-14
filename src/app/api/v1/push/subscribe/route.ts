import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { vapidPublicKey } from "@/lib/pushSend";

// This device's system pop-ups (Web Push), turned on and off in Settings → Account.
// The browser's subscription is sent in the body, never in the address.

/** The key the browser subscribes with; null when push is not set up on this server. */
export const GET = withAuth(null, async () => json({ publicKey: vapidPublicKey() }));

const Subscription = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "The push address must be https"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** A person keeps this many devices; signing in on more drops the oldest. */
const MAX_PER_USER = 10;

export const POST = withAuth(null, async ({ req, user }) => {
  if (!vapidPublicKey()) throw new ApiError(503, "Notifications are not set up on this server");
  const body = await parseBody(req, Subscription);
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const data = { businessId: user.businessId, userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent };
  // The same browser signed in as someone else now gets that person's notices.
  await prisma.pushSubscription.upsert({ where: { endpoint: body.endpoint }, create: { endpoint: body.endpoint, ...data }, update: data });
  const mine = await prisma.pushSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (mine.length > MAX_PER_USER) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: mine.slice(MAX_PER_USER).map((s) => s.id) } } });
  }
  return json({ subscribed: true });
});

const Unsubscribe = z.object({ endpoint: z.string().min(1).max(2000) });

export const DELETE = withAuth(null, async ({ req, user }) => {
  const body = await parseBody(req, Unsubscribe);
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, businessId: user.businessId } });
  return json({ subscribed: false });
});

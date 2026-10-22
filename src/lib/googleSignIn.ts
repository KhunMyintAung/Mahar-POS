import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { registerTenant } from "./tenant";
import { businessNameFrom, usernameFromEmail, type GoogleIdentity } from "./googleAuth";
import { notifyNewSignup, sendWelcomeEmail } from "./mail";

/** What happens once Google has vouched for someone, whichever way they came: the
 *  redirect flow or Google's own sign-in button.
 *
 *  Signing in matches an existing account by verified email. Where none matches, a new
 *  business is created, the same thing the registration form does. Google is never a way
 *  into a shop that already exists: that would turn knowing an address into access to
 *  someone's money. */

/** No password is chosen, so a long random one is stored: never shown to anyone and not
 *  guessable, which leaves Google as the only way in until the owner sets one. */
async function signUpWithGoogle(identity: GoogleIdentity) {
  // A derived username can collide with an existing account, so take the first free one.
  let username = usernameFromEmail(identity.email);
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const taken = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
      select: { id: true },
    });
    if (!taken) break;
    username = usernameFromEmail(identity.email, attempt);
  }

  const { business, owner } = await registerTenant({
    businessName: businessNameFrom(identity),
    ownerName: identity.name?.trim() || undefined,
    username,
    email: identity.email,
    password: randomBytes(24).toString("hex"),
    currency: "MMK",
    timezone: "Asia/Yangon",
  });
  return { user: await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }), businessName: business.name, username };
}

export type GoogleSignInResult =
  | { ok: true; user: { id: string; businessId: string }; isNew: boolean }
  | { ok: false; reason: "google_unverified" | "google_disabled" | "locked" | "google_signup_failed" };

export async function signInWithGoogle(identity: GoogleIdentity, meta: { ip?: string; userAgent?: string }): Promise<GoogleSignInResult> {
  // An unverified address proves nothing about who is signing in.
  if (!identity.emailVerified) return { ok: false, reason: "google_unverified" };

  // Matched the same way a password login matches: some accounts hold the address in the
  // username rather than the email field.
  let user = await prisma.user.findFirst({
    where: { OR: [{ email: identity.email }, { username: identity.email }], deletedAt: null },
  });
  if (user && !user.active) return { ok: false, reason: "google_disabled" };
  if (user?.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "locked" };

  let isNew = false;
  if (!user) {
    isNew = true;
    try {
      const made = await signUpWithGoogle(identity);
      user = made.user;
      sendWelcomeEmail({ to: identity.email, name: identity.name ?? made.username, businessName: made.businessName, username: made.username, viaGoogle: true });
      notifyNewSignup({ businessName: made.businessName, email: identity.email, username: made.username, method: "Google" });
    } catch (error) {
      console.error("[google signup]", error);
      return { ok: false, reason: "google_signup_failed" };
    }
    await audit(prisma, {
      businessId: user.businessId, userId: user.id, action: "REGISTER", module: "auth",
      ip: meta.ip, userAgent: meta.userAgent, after: { method: "google", email: identity.email },
    });
  }

  // Signing in another way clears the failure count, exactly as a password login does.
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "LOGIN", module: "auth",
    ip: meta.ip, userAgent: meta.userAgent, after: { method: "google" },
  });
  return { ok: true, user, isNew };
}

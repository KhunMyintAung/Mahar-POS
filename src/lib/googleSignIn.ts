import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
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
    emailVerified: true,
    password: randomBytes(24).toString("hex"),
    currency: "MMK",
    timezone: "Asia/Yangon",
  });
  return { user: await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }), businessName: business.name, username };
}

type MatchedUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

/** Google has just shown this person owns the address, but the account holding it was set
 *  up with the address typed in, which proves nothing: anyone could have registered with
 *  someone else's email before they did. So the address's owner takes the account over.
 *  The password whoever set it up chose stops working and every session is ended, so a
 *  stranger who registered first is out. The owner sets a password again with "Forgot
 *  password", which now reaches them. */
async function claimUnverifiedAccount(
  user: MatchedUser,
  identity: GoogleIdentity,
  meta: { ip?: string; userAgent?: string },
): Promise<MatchedUser | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.user.update({
        where: { id: user.id },
        data: {
          email: user.email ?? identity.email,
          emailVerifiedAt: new Date(),
          passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        },
      });
      const ended = await tx.authSession.deleteMany({ where: { userId: user.id } });
      await audit(tx, {
        businessId: user.businessId, userId: user.id, action: "UPDATE", module: "auth",
        resourceType: "User", resourceId: user.id, ip: meta.ip, userAgent: meta.userAgent,
        after: { emailVerified: "google", passwordCleared: true, sessionsEnded: ended.count },
      });
      return claimed;
    });
  } catch (error) {
    console.error("[google claim]", error);
    return null;
  }
}

export type GoogleSignInResult =
  | { ok: true; user: { id: string; businessId: string }; isNew: boolean }
  | { ok: false; reason: "google_unverified" | "google_disabled" | "locked" | "google_signup_failed" };

export async function signInWithGoogle(identity: GoogleIdentity, meta: { ip?: string; userAgent?: string }): Promise<GoogleSignInResult> {
  // An unverified address proves nothing about who is signing in.
  if (!identity.emailVerified) return { ok: false, reason: "google_unverified" };

  // Matched on the email field first. Some older accounts hold the address in the username
  // instead; those match only when their email field is empty or the same address, so a
  // username that merely looks like someone's address never borrows their Google.
  let user =
    (await prisma.user.findFirst({ where: { email: identity.email, deletedAt: null } })) ??
    (await prisma.user.findFirst({
      where: { username: identity.email, deletedAt: null, OR: [{ email: null }, { email: identity.email }] },
    }));
  if (user && !user.active) return { ok: false, reason: "google_disabled" };
  if (user?.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "locked" };

  if (user && !user.emailVerifiedAt) {
    const claimed = await claimUnverifiedAccount(user, identity, meta);
    if (!claimed) return { ok: false, reason: "google_signup_failed" };
    user = claimed;
  }

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

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { registerTenant } from "@/lib/tenant";
import {
  businessNameFrom,
  exchangeCodeForIdentity,
  googleConfig,
  usernameFromEmail,
  GOOGLE_STATE_COOKIE,
  type GoogleIdentity,
} from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

/** Create a business for someone Google has just vouched for.
 *
 *  No password is chosen, so a long random one is stored: it is never shown to anyone and
 *  cannot be guessed, which leaves Google as the only way in until the owner sets one.
 */
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

  const { owner } = await registerTenant({
    businessName: businessNameFrom(identity),
    ownerName: identity.name?.trim() || undefined,
    username,
    email: identity.email,
    password: randomBytes(24).toString("hex"),
    currency: "MMK",
    timezone: "Asia/Yangon",
  });
  return prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
}

function backToLogin(reason: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL(`/login?error=${reason}`, base));
  // The attempt is over either way; leaving the state behind only invites replay.
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}

export async function GET(req: NextRequest) {
  const config = googleConfig();
  if (!config) return backToLogin("google_unavailable");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return backToLogin("google_cancelled");

  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  // Compared before anything is exchanged: a callback that did not begin at our start
  // route is not one we act on.
  if (!code || !state || !expected || state !== expected) {
    return backToLogin("google_state");
  }

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  let identity;
  try {
    identity = await exchangeCodeForIdentity(config, code);
  } catch (error) {
    console.error("[google auth]", error);
    return backToLogin("google_failed");
  }

  // An unverified address proves nothing about who is signing in.
  if (!identity.emailVerified) return backToLogin("google_unverified");

  // Matched the same way a password login matches: some accounts hold the address in the
  // username rather than the email field.
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identity.email }, { username: identity.email }],
      deletedAt: null,
    },
  });

  if (user && !user.active) return backToLogin("google_disabled");
  if (user?.lockedUntil && user.lockedUntil > new Date()) return backToLogin("locked");

  // Nobody matched, so this is a new business — the same thing the registration form
  // creates, which anyone can already use. Google is never a way into a shop that
  // already exists: that would turn knowing an address into access to someone's money.
  let isNewAccount = false;
  if (!user) {
    isNewAccount = true;
    try {
      user = await signUpWithGoogle(identity);
    } catch (error) {
      console.error("[google signup]", error);
      return backToLogin("google_signup_failed");
    }
    await audit(prisma, {
      businessId: user.businessId,
      userId: user.id,
      action: "REGISTER",
      module: "auth",
      ip,
      userAgent,
      after: { method: "google", email: identity.email },
    });
  }

  // Signing in another way clears the failure count, exactly as a password login does.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  const { token, expiresAt } = await createSession(user.id, { ip, userAgent });
  await audit(prisma, {
    businessId: user.businessId,
    userId: user.id,
    action: "LOGIN",
    module: "auth",
    ip,
    userAgent,
    after: { method: "google" },
  });

  // A new account has never been asked what kind of business it is, and that decides which
  // modules show. Existing accounts already answered and go straight in.
  const response = NextResponse.redirect(
    new URL(isNewAccount ? "/welcome" : "/", process.env.APP_URL)
  );
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}

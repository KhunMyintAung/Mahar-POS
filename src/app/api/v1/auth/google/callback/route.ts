import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { exchangeCodeForIdentity, googleConfig, GOOGLE_STATE_COOKIE } from "@/lib/googleAuth";
import { signInWithGoogle } from "@/lib/googleSignIn";

export const dynamic = "force-dynamic";

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

  const result = await signInWithGoogle(identity, { ip, userAgent });
  if (!result.ok) return backToLogin(result.reason);
  const { token, expiresAt } = await createSession(result.user.id, { ip, userAgent });

  // A new account has never been asked what kind of business it is, and that decides which
  // modules show. Existing accounts already answered and go straight in.
  const response = NextResponse.redirect(
    new URL(result.isNew ? "/welcome" : "/", process.env.APP_URL)
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

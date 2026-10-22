import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { errorJson, handleError, parseBody } from "@/lib/api";
import { googleClientId, verifyIdToken } from "@/lib/googleAuth";
import { signInWithGoogle } from "@/lib/googleSignIn";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  google_unverified: "That Google address is not verified. Verify it with Google, then try again.",
  google_disabled: "That account has been disabled. Please contact your admin.",
  locked: "Account is locked. Try again shortly.",
  google_signup_failed: "Could not create an account from that Google address. Please try again.",
};

/** Sign in with the credential from Google's own sign-in button. */
export async function POST(req: NextRequest) {
  try {
    const clientId = googleClientId();
    if (!clientId) return errorJson(404, "Google sign-in is not set up for this site.");
    const { credential } = await parseBody(req, z.object({ credential: z.string().min(20).max(5000) }));
    let identity;
    try {
      identity = await verifyIdToken(credential, clientId);
    } catch (e) {
      console.error("[google idtoken]", e);
      return errorJson(401, "Google sign-in could not be completed. Please try again.");
    }
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const result = await signInWithGoogle(identity, { ip, userAgent });
    if (!result.ok) return errorJson(403, MESSAGES[result.reason]);

    const { token, expiresAt } = await createSession(result.user.id, { ip, userAgent });
    const res = NextResponse.json({ ok: true, data: { redirect: result.isNew ? "/welcome" : "/" } });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/",
    });
    return res;
  } catch (error) {
    return handleError(error);
  }
}

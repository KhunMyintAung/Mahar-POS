import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * Lands a user who signed in at the phone-shop app. The token names who to sign
 * in and expires in a minute; the session itself is minted here, so the cookie
 * is set by this app on its own domain exactly as an ordinary login would.
 */
/**
 * Behind a reverse proxy the request URL carries the internal bind address, so
 * redirects built from it point at 0.0.0.0. Prefer the configured public origin
 * and fall back to the forwarded host.
 */
function publicOrigin(req: NextRequest): string {
  const configured = String(process.env.APP_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const token = req.nextUrl.searchParams.get("t") || "";
  const failed = NextResponse.redirect(new URL("/login?handoff=failed", origin));
  if (!token) return failed;

  const secret = String(process.env.AUTH_SECRET || "");
  if (!secret) return failed;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.use !== "handoff" || typeof payload.sub !== "string") return failed;
    userId = payload.sub;
  } catch {
    return failed;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, active: true },
  });
  if (!user) return failed;

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const { token: sessionToken, expiresAt } = await createSession(user.id, { ip, userAgent });
  await audit(prisma, {
    businessId: user.businessId,
    userId: user.id,
    action: "LOGIN",
    module: "auth",
    ip,
    userAgent,
  });

  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return res;
}

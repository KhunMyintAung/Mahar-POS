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
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || "";
  const failed = NextResponse.redirect(new URL("/login?handoff=failed", req.nextUrl.origin));
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

  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return res;
}

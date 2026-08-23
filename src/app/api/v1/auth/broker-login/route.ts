import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { MAX_FAILED_LOGINS, LOCK_MINUTES } from "@/lib/auth";
import { handleError, errorJson, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * Signs a grocery-shop user in on behalf of the phone-shop app, which is the
 * single front door: someone types one username and password there and lands in
 * whichever app their account belongs to.
 *
 * The caller must hold BROKER_SECRET, so only that app can ask. Nothing is
 * signed in here — this returns a short-lived, single-purpose URL, and the
 * session cookie is only ever set on this app's own domain by /auth/handoff.
 */
const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const HANDOFF_SECONDS = 60;

function brokerSecret(): string | null {
  const secret = String(process.env.BROKER_SECRET || "").trim();
  return secret.length >= 16 ? secret : null;
}

export async function POST(req: NextRequest) {
  try {
    const secret = brokerSecret();
    // Absent or weak secret means the door is simply not open, rather than open
    // to anyone who happens to send an empty header.
    if (!secret) return errorJson(503, "Broker login is not configured");

    const presented = req.headers.get("x-broker-secret") || "";
    if (presented !== secret) return errorJson(401, "Unauthorized");

    const { username, password } = await parseBody(req, schema);
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }],
        deletedAt: null,
      },
    });

    // The same lockout accounting the ordinary login does, so brokering cannot
    // be used to hammer passwords past the limit that guards the login page.
    const fail = async () => {
      if (user) {
        const failed = user.failedLogins + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: failed,
            lockedUntil:
              failed >= MAX_FAILED_LOGINS
                ? new Date(Date.now() + LOCK_MINUTES * 60_000)
                : user.lockedUntil,
          },
        });
        await audit(prisma, {
          businessId: user.businessId,
          userId: user.id,
          action: "LOGIN_FAILED",
          module: "auth",
          ip,
          userAgent,
        });
      }
      return errorJson(401, "Invalid username or password");
    };

    if (!user || !user.active) return fail();
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return errorJson(423, `Account is locked. Try again after ${LOCK_MINUTES} minutes.`);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return fail();

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    // Carries only who to sign in, never a session token, so nothing reusable
    // ends up in a URL, a proxy log or a referrer header.
    const handoff = await new SignJWT({ sub: user.id, use: "handoff" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${HANDOFF_SECONDS}s`)
      .sign(new TextEncoder().encode(String(process.env.AUTH_SECRET || "")));

    const appUrl = String(process.env.APP_URL || "").replace(/\/+$/, "");
    return NextResponse.json({
      ok: true,
      data: {
        handoffUrl: `${appUrl}/auth/handoff?t=${encodeURIComponent(handoff)}`,
        expiresInSeconds: HANDOFF_SECONDS,
        name: user.name,
        username: user.username,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

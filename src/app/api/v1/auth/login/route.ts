import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE, MAX_FAILED_LOGINS, LOCK_MINUTES } from "@/lib/auth";
import { handleError, errorJson, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await parseBody(req, schema);
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }],
        deletedAt: null,
      },
    });

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
          businessId: user.businessId, userId: user.id,
          action: "LOGIN_FAILED", module: "auth", ip, userAgent,
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
    const { token, expiresAt } = await createSession(user.id, { ip, userAgent });
    await audit(prisma, {
      businessId: user.businessId, userId: user.id,
      action: "LOGIN", module: "auth", ip, userAgent,
    });

    const res = NextResponse.json({ ok: true, data: { name: user.name, username: user.username } });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
    });
    return res;
  } catch (e) {
    return handleError(e);
  }
}

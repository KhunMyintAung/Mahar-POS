import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorJson, handleError, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { mailEnabled, sendPasswordResetEmail } from "@/lib/mail";
import { makeResetToken } from "@/lib/passwordReset";

const attempts = new Map<string, { count: number; resetAt: number }>();

/** Five requests an hour from one address is plenty for a real person. */
function allow(key: string) {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || cur.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60 * 60_000 }); return true; }
  cur.count += 1;
  return cur.count <= 5;
}

/** Emails a reset link. Answers the same whether or not the address has an account, so
 *  this cannot be used to find out who is registered. */
export async function POST(req: NextRequest) {
  try {
    if (!mailEnabled()) return errorJson(503, "Password reset by email is not available. Please contact the shop owner.");
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const { email } = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email().max(160) }));
    if (!allow(ip) || !allow(email)) return errorJson(429, "Too many requests. Try again later.");

    const user = await prisma.user.findFirst({
      where: { OR: [{ email }, { username: email }], deletedAt: null, active: true },
    });
    if (user) {
      const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
      const link = `${base}/reset-password?token=${encodeURIComponent(makeResetToken(user))}`;
      try {
        await sendPasswordResetEmail({ to: user.email ?? email, name: user.name, link });
      } catch (e) {
        console.error("[forgot password]", e);
        return errorJson(502, "The email could not be sent. Please try again later.");
      }
    }
    return NextResponse.json({ ok: true, data: { sent: true } });
  } catch (error) {
    return handleError(error);
  }
}

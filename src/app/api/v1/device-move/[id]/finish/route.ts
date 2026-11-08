import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { notifyNewSignup, sendWelcomeEmail } from "@/lib/mail";
import { finishMove } from "@/services/deviceMove";

/** The whole shop has arrived: it becomes an online account, and this device is signed in. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const r = await finishMove(id);
    sendWelcomeEmail({ to: r.account.email, name: r.ownerName, businessName: r.businessName, username: r.account.username });
    notifyNewSignup({ businessName: r.businessName, email: r.account.email, username: r.account.username, method: "Moved from This device only" });
    const { token, expiresAt } = await createSession(r.ownerId, { ip: r.account.ip, userAgent: req.headers.get("user-agent") ?? undefined });
    const res = NextResponse.json({ ok: true, data: { username: r.account.username, businessName: r.businessName } });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
    });
    return res;
  } catch (error) {
    return handleError(error);
  }
}

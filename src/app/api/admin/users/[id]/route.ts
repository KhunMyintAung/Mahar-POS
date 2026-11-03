import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isAdminRequest } from "@/lib/adminAccess";
import { mailEnabled, sendPasswordResetEmail } from "@/lib/mail";
import { makeResetToken } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

/** One account, from the admin portal: switch it on or off, sign it out everywhere, email it
 *  a password reset link, or set a new password for it (when its email is wrong or missing,
 *  the owner gets the new password from the admin in person). Admin only. The password is
 *  never stored or logged as typed: only its hash is kept. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const { action, password } = (await req.json().catch(() => ({}))) as { action?: string; password?: unknown };
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  if (action === "enable" || action === "disable") {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { active: action === "enable", ...(action === "enable" ? { failedLogins: 0, lockedUntil: null } : {}) } });
      if (action === "disable") await tx.authSession.deleteMany({ where: { userId: id } });
      await audit(tx, { businessId: user.businessId, action: action === "enable" ? "UNLOCK" : "LOCK", module: "admin", resourceType: "User", resourceId: id, after: { by: "admin portal" } });
    });
    return NextResponse.json({ ok: true, data: { active: action === "enable" } });
  }
  if (action === "signout") {
    const { count } = await prisma.authSession.deleteMany({ where: { userId: id } });
    await audit(prisma, { businessId: user.businessId, action: "UPDATE", module: "admin", resourceType: "User", resourceId: id, after: { signedOut: count, by: "admin portal" } });
    return NextResponse.json({ ok: true, data: { signedOut: count } });
  }
  if (action === "reset") {
    if (!mailEnabled()) return NextResponse.json({ ok: false, error: "Email is not set up" }, { status: 503 });
    if (!user.email) return NextResponse.json({ ok: false, error: "This account has no email address" }, { status: 422 });
    const link = `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(makeResetToken(user))}`;
    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, link });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, data: { sentTo: user.email } });
  }
  if (action === "setpassword") {
    if (typeof password !== "string" || password.length < 8 || password.length > 72)
      return NextResponse.json({ ok: false, error: "Password must be 8 to 72 characters" }, { status: 422 });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      // A fresh start: unlocked, and signed out everywhere so only the new password works.
      await tx.user.update({ where: { id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
      await tx.authSession.deleteMany({ where: { userId: id } });
      await audit(tx, { businessId: user.businessId, action: "UPDATE", module: "admin", resourceType: "User", resourceId: id, after: { passwordSet: true, by: "admin portal" } });
    });
    return NextResponse.json({ ok: true, data: { username: user.username } });
  }
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 422 });
}

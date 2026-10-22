import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isAdminRequest } from "@/lib/adminAccess";
import { mailEnabled, sendPasswordResetEmail } from "@/lib/mail";
import { makeResetToken } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

/** One account, from the admin portal: switch it on or off, sign it out everywhere, or
 *  email it a password reset link. Admin only. Nothing here sees or sets a password. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
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
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 422 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";
import { businessDateOf } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** New shops, new users and sign-ins per day over the last 30 days. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const since = new Date(Date.now() - 30 * 86400_000);
  const [shops, users, logins] = await Promise.all([
    prisma.business.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.auditLog.findMany({ where: { action: "LOGIN", createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  const days: { date: string; shops: number; users: number; logins: number }[] = [];
  for (let i = 29; i >= 0; i--) days.push({ date: businessDateOf(new Date(Date.now() - i * 86400_000)), shops: 0, users: 0, logins: 0 });
  const at = (d: Date) => days.find((x) => x.date === businessDateOf(d));
  for (const s of shops) { const r = at(s.createdAt); if (r) r.shops++; }
  for (const u of users) { const r = at(u.createdAt); if (r) r.users++; }
  for (const l of logins) { const r = at(l.createdAt); if (r) r.logins++; }
  return NextResponse.json({ ok: true, data: { days } });
}

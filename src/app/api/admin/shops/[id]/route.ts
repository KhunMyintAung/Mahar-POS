import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isAdminRequest } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

/** Lock or unlock a whole shop: every account in it is switched off (and signed out) or
 *  back on. Nothing in the shop is deleted. Admin only. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { locked?: unknown };
  if (typeof body.locked !== "boolean") return NextResponse.json({ ok: false, error: "locked must be true or false" }, { status: 422 });
  const business = await prisma.business.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!business) return NextResponse.json({ ok: false, error: "Shop not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { businessId: id, deletedAt: null }, data: { active: !body.locked } });
    if (body.locked) await tx.authSession.deleteMany({ where: { user: { businessId: id } } });
    await audit(tx, { businessId: id, action: body.locked ? "LOCK" : "UNLOCK", module: "admin", resourceType: "Business", resourceId: id, after: { locked: body.locked, by: "admin portal" } });
  });
  return NextResponse.json({ ok: true, data: { id, locked: body.locked } });
}

/** Records a Pro payment: extends the shop's Pro by `proMonths` months from whichever is
 *  later — now or its current Pro end — so paying early never loses days. `proMonths: 0`
 *  ends Pro now (back to Free). Admin only. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { proMonths?: unknown };
  const months = body.proMonths;
  if (typeof months !== "number" || !Number.isInteger(months) || months < 0 || months > 120) {
    return NextResponse.json({ ok: false, error: "proMonths must be a whole number of months" }, { status: 422 });
  }
  const business = await prisma.business.findUnique({ where: { id }, select: { id: true, name: true, proUntil: true } });
  if (!business) return NextResponse.json({ ok: false, error: "Shop not found" }, { status: 404 });
  const now = new Date();
  let proUntil: Date | null;
  if (months === 0) {
    proUntil = now; // expired now → Free
  } else {
    const base = business.proUntil && business.proUntil > now ? business.proUntil : now;
    proUntil = new Date(base);
    proUntil.setMonth(proUntil.getMonth() + months);
  }
  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id }, data: { proUntil } });
    await audit(tx, { businessId: id, action: "UPDATE", module: "admin", resourceType: "Business", resourceId: id, after: { proMonths: months, proUntil: proUntil?.toISOString() ?? null, by: "admin portal" } });
  });
  return NextResponse.json({ ok: true, data: { id, proUntil } });
}

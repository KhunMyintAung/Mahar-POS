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

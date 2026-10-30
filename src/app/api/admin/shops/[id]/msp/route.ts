import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isAdminRequest } from "@/lib/adminAccess";
import { setPromo } from "@/services/mspRewardService";

export const dynamic = "force-dynamic";

/** Puts a shop in the MSP promotion (it may then switch the reward on) or takes it out
 *  (it stops earning; points already earned are still sent). Admin only. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { promo?: unknown };
  if (typeof body.promo !== "boolean") return NextResponse.json({ ok: false, error: "promo must be true or false" }, { status: 422 });
  const business = await prisma.business.findUnique({ where: { id }, select: { id: true } });
  if (!business) return NextResponse.json({ ok: false, error: "Shop not found" }, { status: 404 });
  await setPromo(id, body.promo);
  await audit(prisma, { businessId: id, action: "UPDATE", module: "admin", resourceType: "MspPromo", resourceId: id, after: { promo: body.promo, by: "admin portal" } });
  return NextResponse.json({ ok: true, data: { id, promo: body.promo } });
}

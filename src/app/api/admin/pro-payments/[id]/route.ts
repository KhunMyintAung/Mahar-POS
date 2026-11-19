import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isAdminRequest } from "@/lib/adminAccess";
import { notifyAuditFeed } from "@/lib/telegramNotify";
import { extendProUntil } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** The operator reviews a Pro payment. "approve" extends the shop's Pro by the payment's months
 *  (from whichever is later — now or its current end) and turns Pro on; "reject" records a reason;
 *  "void" undoes a mistaken approval, putting the shop's Pro back to the date it had before.
 *  approve/reject act only on a waiting payment; void acts only on an approved one. Admin only. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; note?: unknown };
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "void") {
    return NextResponse.json({ ok: false, error: "action must be approve, reject, or void" }, { status: 422 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

  const payment = await prisma.proPayment.findUnique({
    where: { id },
    include: { business: { select: { id: true, name: true, proUntil: true, proTier: true } } },
  });
  if (!payment) return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });

  const now = new Date();
  const businessId = payment.business.id;

  // Undo a mistaken approval: put the shop's Pro back to the date kept when it was approved.
  if (action === "void") {
    if (payment.status !== "APPROVED") {
      return NextResponse.json({ ok: false, error: "Only an approved payment can be voided" }, { status: 409 });
    }
    const restored = payment.revertProUntil ?? now; // no stored date (older row) → end Pro now
    await prisma.$transaction(async (tx) => {
      // The date and the level the shop had before the approval, both put back.
      await tx.business.update({ where: { id: businessId }, data: { proUntil: restored, proTier: payment.revertProTier } });
      await tx.proPayment.update({ where: { id }, data: { status: "VOIDED", note, reviewedAt: now } });
      await audit(tx, { businessId, action: "UPDATE", module: "admin", resourceType: "ProPayment", resourceId: id, after: { status: "VOIDED", note, proUntil: restored.toISOString(), by: "admin portal" } });
    });
    notifyAuditFeed(businessId,
      `A Pro payment was reversed${note ? ` — ${note}` : ""}. Please contact the shop that gave you Mahar POS if this is unexpected.`,
      undefined, undefined, { url: "/settings?upgrade=1", perm: "settings.manage" });
    return NextResponse.json({ ok: true, data: { id, status: "VOIDED", proUntil: restored } });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "This payment has already been reviewed" }, { status: 409 });
  }

  if (action === "reject") {
    await prisma.$transaction(async (tx) => {
      await tx.proPayment.update({ where: { id }, data: { status: "REJECTED", note, reviewedAt: now } });
      await audit(tx, { businessId, action: "UPDATE", module: "admin", resourceType: "ProPayment", resourceId: id, after: { status: "REJECTED", note, by: "admin portal" } });
    });
    notifyAuditFeed(businessId,
      `Pro payment could not be confirmed${note ? ` — ${note}` : ""}. Please check and submit again.`,
      undefined, undefined, { url: "/settings?upgrade=1", perm: "settings.manage" });
    return NextResponse.json({ ok: true, data: { id, status: "REJECTED" } });
  }

  // approve — keep the Pro end date it had, so a later void can put it back exactly.
  const proUntil = extendProUntil(payment.business.proUntil, payment.months, now);
  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: businessId }, data: { proUntil, proTier: payment.tier } });
    await tx.proPayment.update({ where: { id }, data: { status: "APPROVED", note, reviewedAt: now, revertProUntil: payment.business.proUntil ?? null, revertProTier: payment.business.proTier ?? null } });
    await audit(tx, { businessId, action: "UPDATE", module: "admin", resourceType: "ProPayment", resourceId: id, after: { status: "APPROVED", tier: payment.tier, months: payment.months, proUntil: proUntil.toISOString(), by: "admin portal" } });
  });
  notifyAuditFeed(businessId,
    `${payment.tier === "FULL" ? "Fully Access" : "Pro"} is on — ${payment.months} month${payment.months === 1 ? "" : "s"} added. Your plan runs to ${proUntil.toLocaleDateString("en-GB")}. Thank you!`,
    undefined, undefined, { url: "/settings?upgrade=1", perm: "settings.manage" });
  return NextResponse.json({ ok: true, data: { id, status: "APPROVED", proUntil } });
}

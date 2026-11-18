import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isAdminRequest } from "@/lib/adminAccess";
import { notifyAuditFeed } from "@/lib/telegramNotify";
import { extendProUntil } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** The operator reviews a Pro payment. "approve" extends the shop's Pro by the payment's months
 *  (from whichever is later — now or its current end) and turns Pro on; "reject" records a reason.
 *  Only a payment still waiting can be acted on, so it is never counted twice. Admin only. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; note?: unknown };
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, error: "action must be approve or reject" }, { status: 422 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

  const payment = await prisma.proPayment.findUnique({
    where: { id },
    include: { business: { select: { id: true, name: true, proUntil: true } } },
  });
  if (!payment) return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
  if (payment.status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "This payment has already been reviewed" }, { status: 409 });
  }

  const now = new Date();
  const businessId = payment.business.id;

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

  // approve
  const proUntil = extendProUntil(payment.business.proUntil, payment.months, now);
  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: businessId }, data: { proUntil } });
    await tx.proPayment.update({ where: { id }, data: { status: "APPROVED", note, reviewedAt: now } });
    await audit(tx, { businessId, action: "UPDATE", module: "admin", resourceType: "ProPayment", resourceId: id, after: { status: "APPROVED", months: payment.months, proUntil: proUntil.toISOString(), by: "admin portal" } });
  });
  notifyAuditFeed(businessId,
    `Pro is on — ${payment.months} month${payment.months === 1 ? "" : "s"} added. Your plan runs to ${proUntil.toLocaleDateString("en-GB")}. Thank you!`,
    undefined, undefined, { url: "/settings?upgrade=1", perm: "settings.manage" });
  return NextResponse.json({ ok: true, data: { id, status: "APPROVED", proUntil } });
}

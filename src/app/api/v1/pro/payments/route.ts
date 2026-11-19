import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notifyAuditFeed } from "@/lib/telegramNotify";
import { PRO_MONTH_OPTIONS, proTotalMMK, proTotalTHB } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** The shop's own Pro payment requests, newest first, so the upgrade screen can show whether
 *  one is under review and the outcome of past ones. */
export const GET = withAuth(null, async ({ user }) => {
  const payments = await prisma.proPayment.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
    // The slip image is large and not needed in the list; left out on purpose.
    select: { id: true, months: true, tier: true, amountMinor: true, amountThb: true, method: true, status: true, note: true, reviewedAt: true, createdAt: true },
  });
  return json({ payments });
});

const schema = z.object({
  tier: z.enum(["PRO", "FULL"]),
  months: z.number().int().refine((m) => (PRO_MONTH_OPTIONS as readonly number[]).includes(m), "Pick 1, 3, 6 or 12 months"),
  method: z.enum(["KBZPAY", "PROMPAY"]),
  // The payment-slip screenshot as a resized data URL (the browser shrinks it first). Capped so a
  // full-size photo cannot be posted; resizeImage keeps it well under this.
  slipUrl: z.string().startsWith("data:image/", "Upload a screenshot of your payment").max(900_000, "That image is too large"),
});

/** A shop submits a Pro payment: it has paid the operator and uploads the slip. The amount is set
 *  here from the price list, not trusted from the client. It stays PENDING until the operator
 *  approves it in the admin portal, which is what actually turns Pro on. */
export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);

  // One request at a time: while a payment is still under review, block a second.
  const pending = await prisma.proPayment.count({ where: { businessId: user.businessId, status: "PENDING" } });
  if (pending > 0) throw new ApiError(409, "You already have a payment under review. Please wait for it to be checked.");

  const totalMMK = proTotalMMK(body.tier, body.months);
  const amountMinor = totalMMK * 100;
  // A Thai payer sends baht from the Thai price list, which the operator checks the slip against
  // (the kyat total is kept alongside as the list price in kyat).
  const amountThb = body.method === "PROMPAY" ? proTotalTHB(body.tier, body.months) : null;

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.proPayment.create({
      data: { businessId: user.businessId, months: body.months, tier: body.tier, amountMinor, amountThb, method: body.method, slipUrl: body.slipUrl, status: "PENDING" },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "settings", resourceType: "ProPayment", resourceId: p.id,
      after: { tier: p.tier, months: p.months, amountMinor: p.amountMinor, amountThb: p.amountThb, method: p.method, status: p.status },
    });
    return p;
  });

  // Let the shop's managers see it was received (the operator reviews it in the portal).
  notifyAuditFeed(user.businessId,
    `Pro payment submitted — ${body.tier === "FULL" ? "Fully Access" : "Pro"}, ${body.months} month${body.months === 1 ? "" : "s"}, ${amountThb != null ? `${amountThb} THB` : `${totalMMK} Ks`}. Waiting for the operator to check it.`,
    undefined, user.id, { url: "/settings?upgrade=1", perm: "settings.manage" });

  return json({ id: payment.id, status: payment.status }, { status: 201 });
});

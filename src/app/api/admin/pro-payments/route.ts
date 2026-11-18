import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

/** Pro payments for the operator to review: the ones still waiting (with their slip image) and a
 *  short history of ones already checked. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

  const [pending, recent] = await Promise.all([
    prisma.proPayment.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" }, // oldest first — fairest to review in order
      include: { business: { select: { name: true, phone: true, proUntil: true } } },
    }),
    prisma.proPayment.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: 30,
      // History does not need the heavy slip image.
      select: {
        id: true, months: true, amountMinor: true, method: true, status: true, note: true,
        reviewedAt: true, createdAt: true, business: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, data: { pending, recent } });
}

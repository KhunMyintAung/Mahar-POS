import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { claimableWhere, cloudPrintEnabled } from "@/lib/cloudPrint";

/** The print station takes the shop's oldest waiting slip, or gets null when there is none.
 *
 *  Taking it is a conditional update, so two stations open at once never print one slip
 *  twice: whichever update lands second finds the job no longer waiting. */
export const POST = withAuth("settings.manage", async ({ user }) => {
  if (!cloudPrintEnabled(user.businessId)) throw new ApiError(404, "Not found");
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = new Date();
    const next = await prisma.printJob.findFirst({
      where: claimableWhere(user.businessId, now),
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!next) return json(null);
    const taken = await prisma.printJob.updateMany({
      where: { id: next.id, ...claimableWhere(user.businessId, now) },
      data: { status: "PRINTING", claimedAt: now },
    });
    if (taken.count === 1) {
      const job = await prisma.printJob.findUnique({
        where: { id: next.id },
        select: { id: true, title: true, html: true, createdAt: true },
      });
      return json(job);
    }
  }
  return json(null);
});

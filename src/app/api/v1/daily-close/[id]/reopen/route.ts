import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const schema = z.object({ reason: z.string().min(3, "A reason is required") });

export const POST = withAuth("daily_close.reopen", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const close = await prisma.dailyClose.findUnique({ where: { id: params.id } });
  if (!close || close.businessId !== user.businessId) throw new ApiError(404, "Daily close not found");
  if (close.status !== "CLOSED" && close.status !== "APPROVED")
    throw new ApiError(422, "This day is not closed");

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.dailyClose.update({
      where: { id: close.id },
      data: { status: "REOPENED", reopenedById: user.id, reopenedAt: new Date(), reopenReason: body.reason },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: close.branchId,
      action: "REOPEN", module: "daily_close", resourceType: "DailyClose", resourceId: c.id,
      reason: body.reason, before: { status: close.status },
    });
    return c;
  });
  return json(updated);
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidBusinessDate, todayBusinessDate } from "@/lib/dates";
import { monthDone, monthShare } from "@/services/bossShareService";
import { takeBossShare } from "@/services/staffService";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate, "Invalid date").optional(),
});

/** Takes a finished month's Boss Share out of a wallet, worked out again from Reports. */
export const POST = withAuth("staff.manage", async ({ req, user }) => {
  if (!user.permissions.includes("report.view")) throw new ApiError(403, "Reports access needed");
  const body = await parseBody(req, schema);
  if (!monthDone(body.month)) throw new ApiError(422, "The month is not over yet");
  const share = await monthShare(user.businessId, body.month);
  const t = await prisma.$transaction((tx) => takeBossShare(tx, {
    businessId: user.businessId, userId: user.id, month: body.month, walletId: body.walletId,
    date: body.date || todayBusinessDate(), shares: share.partners,
  }));
  return json(t, { status: 201 });
});

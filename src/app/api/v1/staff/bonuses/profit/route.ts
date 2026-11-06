import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { todayBusinessDate } from "@/lib/dates";
import { monthShare } from "@/services/bossShareService";
import { giveProfitBonus } from "@/services/staffService";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amounts: z.array(z.object({ staffId: z.string().min(1), amount: z.string() })).min(1).max(100),
});

/** Gives staff a month's profit left after Boss Share, into their held balances. */
export const POST = withAuth("staff.manage", async ({ req, user }) => {
  if (!user.permissions.includes("report.view")) throw new ApiError(403, "Reports access needed");
  const body = await parseBody(req, schema);
  const share = await monthShare(user.businessId, body.month);
  await prisma.$transaction((tx) => giveProfitBonus(tx, {
    businessId: user.businessId, userId: user.id, month: body.month, date: todayBusinessDate(), left: share.left,
    amounts: body.amounts.map((a) => ({ staffId: a.staffId, amount: a.amount.trim() ? toMinor(a.amount) : 0n })),
  }));
  return json({ ok: true }, { status: 201 });
});

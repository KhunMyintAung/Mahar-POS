import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { isValidBusinessDate, todayBusinessDate } from "@/lib/dates";
import { DEPOSIT_MONTHS, depositBalances, returnDeposit } from "@/services/staffService";

/** Each staff member's deposit (kept, paid back, held, months kept) and the paybacks. */
export const GET = withAuth("staff.manage", async ({ user }) => {
  const [balances, returns] = await Promise.all([
    depositBalances(prisma, user.businessId),
    prisma.staffDepositReturn.findMany({ where: { businessId: user.businessId }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  return json({ months: DEPOSIT_MONTHS, balances: [...balances].map(([staffId, b]) => ({ staffId, ...b })), returns });
});

const schema = z.object({
  staffId: z.string().min(1),
  amount: z.string().min(1),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate, "Invalid date").optional(),
  note: z.string().trim().max(140).optional(),
  early: z.boolean().optional(),
});

export const POST = withAuth("staff.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const r = await prisma.$transaction((tx) => returnDeposit(tx, {
    businessId: user.businessId, userId: user.id, staffId: body.staffId, amount: toMinor(body.amount),
    walletId: body.walletId, date: body.date || todayBusinessDate(), note: body.note || undefined, early: body.early,
  }));
  return json(r, { status: 201 });
});

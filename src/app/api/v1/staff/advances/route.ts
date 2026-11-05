import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { isValidBusinessDate, todayBusinessDate } from "@/lib/dates";
import { giveAdvance } from "@/services/staffService";

/** Advances, newest first: open ones are taken off the next salary. */
export const GET = withAuth("staff.manage", async ({ user }) => {
  const rows = await prisma.staffAdvance.findMany({ where: { businessId: user.businessId }, orderBy: { createdAt: "desc" }, take: 300 });
  return json(rows);
});

const schema = z.object({
  staffId: z.string().min(1),
  amount: z.string().min(1),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate, "Invalid date").optional(),
  note: z.string().trim().max(140).optional(),
});

export const POST = withAuth("staff.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const a = await prisma.$transaction((tx) => giveAdvance(tx, {
    businessId: user.businessId, userId: user.id, staffId: body.staffId, amount: toMinor(body.amount),
    walletId: body.walletId, date: body.date || todayBusinessDate(), note: body.note || undefined,
  }));
  return json(a, { status: 201 });
});

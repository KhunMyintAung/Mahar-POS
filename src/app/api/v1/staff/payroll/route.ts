import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { isValidBusinessDate, isValidMonth, todayBusinessDate } from "@/lib/dates";
import { payroll, paySalary } from "@/services/staffService";

/** The month's pay for everyone (?month=YYYY-MM): what each is owed and whether it was paid. */
export const GET = withAuth("staff.manage", async ({ req, user }) => {
  const month = new URL(req.url).searchParams.get("month") || todayBusinessDate().slice(0, 7);
  if (!isValidMonth(month)) throw new ApiError(422, "Invalid month");
  return json({ month, rows: await payroll(user.businessId, month) });
});

const schema = z.object({
  staffId: z.string().min(1),
  month: z.string().refine(isValidMonth, "Invalid month"),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate, "Invalid date").optional(),
  commission: z.string().default("0"),
  bonus: z.string().default("0"),
  otherDeduction: z.string().default("0"),
  attendanceBonus: z.string().optional(),
  deposit: z.string().optional(),
  absentDays: z.number().min(0).max(31).optional(),
  note: z.string().trim().max(280).optional(),
});

export const POST = withAuth("staff.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const p = await prisma.$transaction((tx) => paySalary(tx, {
    businessId: user.businessId, userId: user.id, staffId: body.staffId, month: body.month, walletId: body.walletId,
    date: body.date || todayBusinessDate(), commission: toMinor(body.commission || "0"), bonus: toMinor(body.bonus || "0"),
    otherDeduction: toMinor(body.otherDeduction || "0"), absentDays: body.absentDays, note: body.note || undefined,
    attendanceBonus: body.attendanceBonus === undefined ? undefined : toMinor(body.attendanceBonus || "0"),
    deposit: body.deposit === undefined ? undefined : toMinor(body.deposit || "0"),
  }));
  return json(p, { status: 201 });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidBusinessDate, isValidMonth, todayBusinessDate } from "@/lib/dates";
import { ATTENDANCE_STATUSES } from "@/services/staffService";

/** Attendance for one day (?date=) or a whole month (?month=). */
export const GET = withAuth("users.manage", async ({ req, user }) => {
  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date") || todayBusinessDate();
  if (month && !isValidMonth(month)) throw new ApiError(422, "Invalid month");
  if (!month && !isValidBusinessDate(date)) throw new ApiError(422, "Invalid date");
  const rows = await prisma.staffAttendance.findMany({
    where: { businessId: user.businessId, ...(month ? { date: { gte: `${month}-01`, lte: `${month}-31` } } : { date }) },
    select: { staffId: true, date: true, status: true, note: true },
  });
  return json(rows);
});

const schema = z.object({
  date: z.string().refine(isValidBusinessDate, "Invalid date"),
  entries: z.array(z.object({
    staffId: z.string().min(1),
    /** Empty clears the day. */
    status: z.enum(ATTENDANCE_STATUSES).or(z.literal("")),
    note: z.string().max(140).optional(),
  })).max(200),
});

/** Marks a day for several staff at once. */
export const PUT = withAuth("users.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const ids = new Set((await prisma.staff.findMany({ where: { businessId: user.businessId }, select: { id: true } })).map((s) => s.id));
  await prisma.$transaction(async (tx) => {
    for (const e of body.entries) {
      if (!ids.has(e.staffId)) throw new ApiError(404, "Staff not found");
      if (!e.status) {
        await tx.staffAttendance.deleteMany({ where: { staffId: e.staffId, date: body.date } });
        continue;
      }
      await tx.staffAttendance.upsert({
        where: { staffId_date: { staffId: e.staffId, date: body.date } },
        create: { businessId: user.businessId, staffId: e.staffId, date: body.date, status: e.status, note: e.note || null, createdById: user.id },
        update: { status: e.status, note: e.note || null },
      });
    }
  });
  return json({ ok: true });
});

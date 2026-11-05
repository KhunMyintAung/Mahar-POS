import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  position: z.string().trim().max(60).optional(),
  salary: z.string().optional(),
  attendanceBonus: z.string().optional(),
  deposit: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  userId: z.string().optional().or(z.literal("")),
  note: z.string().trim().max(280).optional(),
  active: z.boolean().optional(),
});

/** Edits a member of staff; switching one off keeps their history. */
export const PATCH = withAuth("staff.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const before = await prisma.staff.findFirst({ where: { id: params.id, businessId: user.businessId } });
  if (!before) throw new ApiError(404, "Staff not found");
  const s = await prisma.staff.update({
    where: { id: before.id },
    data: {
      name: body.name,
      phone: body.phone === undefined ? undefined : body.phone || null,
      position: body.position === undefined ? undefined : body.position || null,
      salary: body.salary === undefined ? undefined : toMinor(body.salary || "0"),
      attendanceBonus: body.attendanceBonus === undefined ? undefined : toMinor(body.attendanceBonus || "0"),
      deposit: body.deposit === undefined ? undefined : toMinor(body.deposit || "0"),
      startDate: body.startDate === undefined ? undefined : body.startDate || null,
      userId: body.userId === undefined ? undefined : body.userId || null,
      note: body.note === undefined ? undefined : body.note || null,
      active: body.active,
    },
  });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "UPDATE", module: "staff", resourceType: "Staff", resourceId: s.id,
    before: { name: before.name, salary: before.salary, active: before.active }, after: { name: s.name, salary: s.salary, active: s.active },
  });
  return json(s);
});

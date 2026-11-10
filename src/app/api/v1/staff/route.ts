import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";

// Staff Management (switched on in Settings): the people the shop pays. Owner and HR only
// (staff.manage).
export const GET = withAuth("staff.manage", async ({ user }) => {
  const staff = await prisma.staff.findMany({ where: { businessId: user.businessId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return json(staff);
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  position: z.string().trim().max(60).optional(),
  salary: z.string().default("0"),
  attendanceBonus: z.string().default("0"),
  deposit: z.string().default("0"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  userId: z.string().optional().or(z.literal("")),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  nrc: z.string().trim().max(40).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional(),
  emergencyContact: z.string().trim().max(120).optional(),
  payAccount: z.string().trim().max(120).optional(),
  note: z.string().trim().max(280).optional(),
});

export const POST = withAuth("staff.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const s = await prisma.staff.create({
    data: {
      businessId: user.businessId, name: body.name, phone: body.phone || null, position: body.position || null,
      salary: toMinor(body.salary || "0"), attendanceBonus: toMinor(body.attendanceBonus || "0"), deposit: toMinor(body.deposit || "0"), startDate: body.startDate || null, userId: body.userId || null, note: body.note || null,
      endDate: body.endDate || null, nrc: body.nrc || null, dateOfBirth: body.dateOfBirth || null, address: body.address || null,
      emergencyContact: body.emergencyContact || null, payAccount: body.payAccount || null,
    },
  });
  await audit(prisma, { businessId: user.businessId, userId: user.id, action: "CREATE", module: "staff", resourceType: "Staff", resourceId: s.id, after: { name: s.name, salary: s.salary } });
  return json(s, { status: 201 });
});

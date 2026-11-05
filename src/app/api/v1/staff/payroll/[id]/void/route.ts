import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { voidSalary } from "@/services/staffService";

export const POST = withAuth("staff.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, z.object({ reason: z.string().trim().max(280).default("") }));
  await prisma.$transaction((tx) => voidSalary(tx, { businessId: user.businessId, userId: user.id, id: params.id, reason: body.reason }));
  return json({ ok: true });
});

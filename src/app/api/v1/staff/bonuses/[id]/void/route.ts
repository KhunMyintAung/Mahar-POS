import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { voidBonus } from "@/services/staffService";

export const POST = withAuth("staff.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, z.object({ reason: z.string().trim().max(280).default("") }));
  await prisma.$transaction((tx) => voidBonus(tx, { businessId: user.businessId, userId: user.id, id: params.id, reason: body.reason }));
  return json({ ok: true });
});

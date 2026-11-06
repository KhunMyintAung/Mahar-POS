import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { voidBossShare } from "@/services/staffService";

export const POST = withAuth("staff.manage", async ({ req, user, params }) => {
  if (!user.permissions.includes("report.view")) throw new ApiError(403, "Reports access needed");
  const body = await parseBody(req, z.object({ reason: z.string().trim().max(280).default("") }));
  await prisma.$transaction((tx) => voidBossShare(tx, { businessId: user.businessId, userId: user.id, id: params.id, reason: body.reason }));
  return json({ ok: true });
});

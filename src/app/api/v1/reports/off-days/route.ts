import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { markOffDay, OFF_DAYS_KEY } from "@/lib/offDays";
import { loadOffDays } from "@/services/offDayService";

/** The shop's off days: its weekly off day and single dates marked off. Read by anyone who
 *  sees reports; set by the owner only. */
export const GET = withAuth("report.view", async ({ user }) => json(await loadOffDays(user.businessId)));

const schema = z.object({
  weekly: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  off: z.boolean().optional(),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  let cfg = await loadOffDays(user.businessId);
  if (body.weekly) cfg = { ...cfg, weekly: [...new Set(body.weekly)].sort() };
  if (body.date && body.off !== undefined) cfg = markOffDay(cfg, body.date, body.off);
  const value = JSON.stringify(cfg);
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { businessId_key: { businessId: user.businessId, key: OFF_DAYS_KEY } },
      create: { businessId: user.businessId, key: OFF_DAYS_KEY, value },
      update: { value },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, action: "UPDATE", module: "settings",
      resourceType: "SystemSetting", resourceId: OFF_DAYS_KEY, after: body,
    });
  });
  return json(cfg);
});

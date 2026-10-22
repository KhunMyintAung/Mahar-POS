import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { REPORT_SETTING, loadReportSettings } from "@/services/reportService";

/** What the reports show: which expense categories are staff salary, and whether owner
 *  and partner drawings appear as "Shares". Anyone who sees reports can read it; only the
 *  owner changes it. */
export const GET = withAuth("report.view", async ({ user }) => json(await loadReportSettings(user.businessId)));

const schema = z.object({
  salaryCategories: z.array(z.string().trim().min(1).max(80)).max(20),
  showShares: z.boolean(),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const value = JSON.stringify(body);
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { businessId_key: { businessId: user.businessId, key: REPORT_SETTING } },
      create: { businessId: user.businessId, key: REPORT_SETTING, value },
      update: { value },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, action: "UPDATE", module: "settings",
      resourceType: "SystemSetting", resourceId: REPORT_SETTING, after: body,
    });
  });
  return json(body);
});

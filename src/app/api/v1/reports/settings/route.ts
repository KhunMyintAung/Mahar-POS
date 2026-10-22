import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { REPORT_SETTING, loadReportSettings } from "@/services/reportService";

/** What the reports show: which expense categories are staff salary, whether owner and
 *  partner drawings appear as "Shares", where general expenses go, the capital kept for
 *  next month and how the rest is split among partners. Anyone who sees reports can read it; only the
 *  owner changes it. */
export const GET = withAuth("report.view", async ({ user }) => json(await loadReportSettings(user.businessId)));

const schema = z.object({
  salaryCategories: z.array(z.string().trim().min(1).max(80)).max(20),
  showShares: z.boolean(),
  stockCategoryIds: z.array(z.string().min(1)).max(50).default([]),
  generalExpenseTo: z.enum(["sales", "service", "topup", "general"]),
  reserve: z.object({ mode: z.enum(["percent", "amount"]), value: z.number().min(0).max(1e12) }),
  partners: z.array(z.object({ name: z.string().trim().min(1).max(60), percent: z.number().min(0).max(100) })).max(10)
    .refine((list) => { const t = list.reduce((a, p) => a + p.percent, 0); return t === 0 || Math.abs(t - 100) < 0.01; }, "Partner shares must add up to 100%, or all be 0 for equal shares"),
}).refine((v) => v.reserve.mode !== "percent" || v.reserve.value <= 100, { message: "Percent can be at most 100", path: ["reserve"] });

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

import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { BUSINESS_CATEGORIES, moduleSettingForCategory } from "@/lib/modules";

/** Choose the kind of business, which is what decides the modules on offer.
 *
 *  Separate from the general settings endpoint because that one is the feature-toggle
 *  screen: it writes whatever switches are set and records the result as "CUSTOM". Picking
 *  a category is the other direction — the category is the intent, and the switches follow
 *  from it — so it needs to survive rather than be flattened away.
 */
const schema = z.object({
  category: z.enum(BUSINESS_CATEGORIES),
  businessName: z.string().trim().min(2).max(80).optional(),
});

export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: "modules" } },
      select: { value: true },
    });

    const value = JSON.stringify(moduleSettingForCategory(body.category));
    await tx.systemSetting.upsert({
      where: { businessId_key: { businessId: user.businessId, key: "modules" } },
      create: { businessId: user.businessId, key: "modules", value },
      update: { value },
    });

    const business = body.businessName
      ? await tx.business.update({
          where: { id: user.businessId },
          data: { name: body.businessName },
        })
      : await tx.business.findUniqueOrThrow({ where: { id: user.businessId } });

    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      action: "UPDATE",
      module: "settings",
      resourceType: "Business",
      resourceId: user.businessId,
      before: { modules: before?.value },
      after: { category: body.category, businessName: business.name },
    });

    return business;
  });

  return json({ id: result.id, name: result.name, category: body.category });
});

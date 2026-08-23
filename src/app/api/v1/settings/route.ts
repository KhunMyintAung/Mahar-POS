import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { moduleSettingFromFeatures, parseModuleAccess } from "@/lib/modules";

// Settings are namespaced JSON documents per business: about, business_profile, modules…

export const GET = withAuth(null, async ({ req, user }) => {
  const key = req.nextUrl.searchParams.get("key");
  const business = await prisma.business.findUnique({ where: { id: user.businessId } });
  const settings = await prisma.systemSetting.findMany({
    where: { businessId: user.businessId, ...(key ? { key } : {}) },
  });
  return json({
    business,
    settings: Object.fromEntries(
      settings.map((setting) => [setting.key, JSON.parse(setting.value)])
    ),
  });
});

const schema = z.object({
  key: z.string().min(1),
  value: z.record(z.string(), z.unknown()),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const value = body.key === "modules"
    ? moduleSettingFromFeatures(parseModuleAccess(body.value).features)
    : body.value;
  const setting = await prisma.$transaction(async (tx) => {
    const before = await tx.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: body.key } },
    });
    const s = await tx.systemSetting.upsert({
      where: { businessId_key: { businessId: user.businessId, key: body.key } },
      create: { businessId: user.businessId, key: body.key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "settings", resourceType: "SystemSetting", resourceId: s.id,
      before: before ? JSON.parse(before.value) : undefined,
      after: value,
    });
    return s;
  });
  return json({ key: setting.key, value: JSON.parse(setting.value) });
});

const bizSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  telegram: z.string().optional(),
  website: z.string().optional(),
});

export const PATCH = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, bizSchema);
  if (Object.keys(body).length === 0) throw new ApiError(422, "Nothing to update");
  const business = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: user.businessId }, data: body });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "settings", resourceType: "Business", resourceId: b.id,
      after: body,
    });
    return b;
  });
  return json(business);
});

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
  const stored = body.key === "modules"
    ? await prisma.systemSetting.findUnique({
        where: { businessId_key: { businessId: user.businessId, key: "modules" } },
        select: { value: true },
      })
    : null;
  // Saving the menu keeps the shop's type; only the switches change.
  const value = body.key === "modules"
    ? moduleSettingFromFeatures(
        parseModuleAccess(body.value).features,
        stored ? parseModuleAccess(JSON.parse(stored.value)).category : "CUSTOM",
      )
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
  websiteLabel: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  // The logo is kept as a small data URL (the settings page shrinks it first), so it needs
  // no file storage and prints from anywhere. Empty removes it.
  logoUrl: z
    .string()
    .max(400_000, "Logo is too large")
    .refine((v) => v === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Logo must be a PNG, JPEG or WebP image")
    .transform((v) => (v === "" ? null : v))
    .optional(),
});

export const PATCH = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, bizSchema);
  if (Object.keys(body).length === 0) throw new ApiError(422, "Nothing to update");
  const business = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: user.businessId }, data: body });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "settings", resourceType: "Business", resourceId: b.id,
      // The image itself would bloat every audit row; that it changed is what matters.
      after: body.logoUrl === undefined ? body : { ...body, logoUrl: body.logoUrl ? "(new logo)" : "(removed)" },
    });
    return b;
  });
  return json(business);
});

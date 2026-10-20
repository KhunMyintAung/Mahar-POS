import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { REPAIR_VOUCHER_SETTING, voucherNumberFormat } from "@/services/repairService";
import { PREFIX_PATTERN, parseRepairVoucherSettings, shopPrefix } from "@/lib/repairVoucherSettings";

/** The repair voucher's number format and printed text, plus the number the next job gets. */

async function read(businessId: string) {
  const [row, seq, business] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: REPAIR_VOUCHER_SETTING } } }),
    prisma.numberSequence.findUnique({ where: { businessId_key: { businessId, key: "REPAIR" } } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
  ]);
  let stored: unknown = {};
  try { stored = row ? JSON.parse(row.value) : {}; } catch { stored = {}; }
  // autoPrefix is what an empty prefix stands for, so the settings page can show it.
  return { ...parseRepairVoucherSettings(stored), nextNumber: seq?.next ?? 1, autoPrefix: shopPrefix(business?.name ?? "") };
}

// Anyone signed in may read it: the cashier printing a voucher needs the text.
export const GET = withAuth(null, async ({ user }) => json(await read(user.businessId)));

const schema = z.object({
  prefix: z.string().trim().regex(PREFIX_PATTERN, "Prefix: up to 6 letters or digits"),
  digits: z.number().int().min(1).max(8),
  nextNumber: z.number().int().min(1).max(99_999_999).optional(),
  tagline: z.string().trim().max(120),
  terms: z.array(z.string().trim().max(200)).max(12),
  qrCaption: z.string().trim().max(120),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const value = parseRepairVoucherSettings({ ...body, terms: body.terms.filter(Boolean) });

  await prisma.$transaction(async (tx) => {
    const before = await tx.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: REPAIR_VOUCHER_SETTING } },
    });
    await tx.systemSetting.upsert({
      where: { businessId_key: { businessId: user.businessId, key: REPAIR_VOUCHER_SETTING } },
      create: { businessId: user.businessId, key: REPAIR_VOUCHER_SETTING, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });

    if (body.nextNumber !== undefined) {
      // Voucher numbers are unique per shop, so starting from a number already handed out
      // would fail the next intake. Refused here, where it can be explained.
      const format = await voucherNumberFormat(tx, user.businessId);
      const upcoming = format(body.nextNumber);
      const taken = await tx.repairJob.findFirst({
        where: { businessId: user.businessId, jobNo: upcoming },
        select: { id: true },
      });
      if (taken) throw new ApiError(422, `${upcoming} is already used. Choose a higher next number.`);
      await tx.numberSequence.upsert({
        where: { businessId_key: { businessId: user.businessId, key: "REPAIR" } },
        create: { businessId: user.businessId, key: "REPAIR", prefix: "RPR", next: body.nextNumber },
        update: { next: body.nextNumber },
      });
    }

    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "settings", resourceType: "SystemSetting", resourceId: REPAIR_VOUCHER_SETTING,
      before: before ? JSON.parse(before.value) : undefined,
      after: { ...value, nextNumber: body.nextNumber },
    });
  });

  return json(await read(user.businessId));
});

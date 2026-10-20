import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseModuleAccess } from "@/lib/modules";
import { addItemCategoryPresets, itemCategoryPresets } from "@/lib/itemCategoryPresets";

/** The ready-made item categories for this kind of shop, and which of them it still lacks. */

async function presetsFor(businessId: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId, key: "modules" } },
    select: { value: true },
  });
  let category: string | undefined;
  try {
    category = setting ? parseModuleAccess(JSON.parse(setting.value)).category : undefined;
  } catch {
    category = undefined;
  }
  return itemCategoryPresets(category);
}

export const GET = withAuth("item.view", async ({ user }) => {
  const presets = await presetsFor(user.businessId);
  const have = await prisma.itemCategory.findMany({
    where: { businessId: user.businessId, parentId: null, active: true },
    select: { name: true },
  });
  const names = new Set(have.map((c) => c.name.trim().toLowerCase()));
  return json({ presets, missing: presets.filter((p) => !names.has(p.toLowerCase())) });
});

export const POST = withAuth("item.manage", async ({ user }) => {
  const presets = await presetsFor(user.businessId);
  const added = await prisma.$transaction((tx) => addItemCategoryPresets(tx, user.businessId, presets));
  return json({ added });
});

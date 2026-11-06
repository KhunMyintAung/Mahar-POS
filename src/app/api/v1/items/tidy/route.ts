import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { correctProductName } from "@/lib/autoCorrect";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { isPhoneShop } from "@/lib/modules";

/** Names typed before auto-correct, or typed loosely: each item whose name (or model) would
 *  change, with the corrected form. Nothing changes until the shop applies the ones it picks. */
async function proposals(businessId: string) {
  const phoneShop = isPhoneShop(await loadModuleAccess(businessId));
  const items = await prisma.item.findMany({
    where: { businessId, deletedAt: null },
    select: { id: true, name: true, model: true },
    orderBy: { name: "asc" },
  });
  return items
    .map((i) => ({
      id: i.id, name: i.name, fixed: correctProductName(i.name, phoneShop),
      model: i.model, fixedModel: i.model ? correctProductName(i.model, phoneShop) : i.model,
    }))
    .filter((i) => i.fixed !== i.name || i.fixedModel !== i.model);
}

export const GET = withAuth("item.manage", async ({ user }) => json({ items: await proposals(user.businessId) }));

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(2000) });

/** Applies the corrections to the items picked; each change is in the audit trail. */
export const POST = withAuth("item.manage", async ({ req, user }) => {
  const { ids } = await parseBody(req, schema);
  const picked = new Set(ids);
  const list = (await proposals(user.businessId)).filter((i) => picked.has(i.id));
  await prisma.$transaction(async (tx) => {
    for (const i of list) {
      await tx.item.update({ where: { id: i.id }, data: { name: i.fixed, model: i.fixedModel } });
      await audit(tx, {
        businessId: user.businessId, userId: user.id, action: "UPDATE", module: "item",
        resourceType: "Item", resourceId: i.id, reason: "Tidy names",
        before: { name: i.name, model: i.model }, after: { name: i.fixed, model: i.fixedModel },
      });
    }
  });
  return json({ updated: list.length });
});

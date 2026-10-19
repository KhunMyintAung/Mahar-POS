import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { repriced, validRule } from "@/lib/reprice";
import { itemsWithStock } from "@/lib/itemStock";

/** Delete or reprice many items in one go. Everything happens in one transaction, so a
 *  bulk change either lands whole or not at all. */

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({
    action: z.literal("reprice"),
    ids: z.array(z.string().min(1)).min(1).max(500),
    rule: z.object({
      mode: z.enum(["set", "percent", "amount"]),
      value: z.number(),
      direction: z.enum(["up", "down"]),
      roundTo: z.number().int().min(0).max(100_000),
    }),
  }),
]);

export const POST = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const ids = [...new Set(body.ids)];

  const result = await prisma.$transaction(async (tx) => {
    // Only this business's live items; an id from anywhere else is simply not found.
    const items = await tx.item.findMany({
      where: { id: { in: ids }, businessId: user.businessId, deletedAt: null },
      select: { id: true, name: true, sku: true, sellingPrice: true },
    });
    if (items.length !== ids.length) throw new ApiError(404, "Some items were not found. Reload and try again.");

    if (body.action === "delete") {
      // Stock on the shelf is money the books still count; an item holding any cannot be
      // deleted until it is sold or adjusted out.
      const stocked = await itemsWithStock(tx, ids);
      if (stocked.length > 0) {
        throw new ApiError(422, `Still in stock, so not deleted: ${stocked.map((s) => s.name).join(", ")}`);
      }
      // Soft delete, as for a single item: past sales still point at these rows.
      await tx.item.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: new Date(), active: false },
      });
      await audit(tx, {
        businessId: user.businessId, userId: user.id,
        action: "DELETE", module: "item", resourceType: "Item", resourceId: `bulk:${ids.length}`,
        before: { items: items.map((i) => ({ id: i.id, name: i.name, sku: i.sku })) },
      });
      return { deleted: items.length };
    }

    const problem = validRule(body.rule);
    if (problem) throw new ApiError(422, problem);
    const changes = items.map((i) => ({ item: i, price: repriced(i.sellingPrice, body.rule) }));
    for (const { item, price } of changes) {
      if (price !== item.sellingPrice) {
        await tx.item.update({ where: { id: item.id }, data: { sellingPrice: price } });
      }
    }
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "UPDATE", module: "item", resourceType: "Item", resourceId: `bulk:${ids.length}`,
      before: { prices: changes.map((c) => ({ sku: c.item.sku, sellingPrice: c.item.sellingPrice.toString() })) },
      after: { rule: body.rule, prices: changes.map((c) => ({ sku: c.item.sku, sellingPrice: c.price.toString() })) },
    });
    return { updated: changes.filter((c) => c.price !== c.item.sellingPrice).length };
  });

  return json(result);
});

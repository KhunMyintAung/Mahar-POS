import type { Tx } from "@/lib/prisma";

/** The items among these that still have stock on hand, across all branches. */
export async function itemsWithStock(tx: Tx, itemIds: string[]): Promise<{ id: string; name: string; quantity: number }[]> {
  if (itemIds.length === 0) return [];
  const totals = await tx.stockLevel.groupBy({
    by: ["itemId"],
    where: { itemId: { in: itemIds } },
    _sum: { quantity: true },
  });
  const stocked = totals.filter((t) => (t._sum.quantity ?? 0) > 0);
  if (stocked.length === 0) return [];
  const names = await tx.item.findMany({
    where: { id: { in: stocked.map((t) => t.itemId) } },
    select: { id: true, name: true },
  });
  const byId = new Map(names.map((n) => [n.id, n.name]));
  return stocked.map((t) => ({ id: t.itemId, name: byId.get(t.itemId) ?? t.itemId, quantity: t._sum.quantity ?? 0 }));
}

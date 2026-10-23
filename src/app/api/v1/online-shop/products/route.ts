import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { stockByItem } from "@/lib/onlineShop";

/** Every active item, with whether it is shown online and its photos, for the Products tab. */
export const GET = withAuth("item.view", async ({ user }) => {
  const items = await prisma.item.findMany({
    where: { businessId: user.businessId, active: true, deletedAt: null },
    select: {
      id: true, name: true, sku: true, sellingPrice: true, onlineVisible: true, description: true,
      category: { select: { name: true } },
      images: { select: { id: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ onlineVisible: "desc" }, { name: "asc" }],
  });
  const stock = await stockByItem(items.map((i) => i.id));
  return json({
    items: items.map((i) => ({
      id: i.id, name: i.name, sku: i.sku, price: i.sellingPrice, onlineVisible: i.onlineVisible,
      description: i.description ?? "", category: i.category?.name ?? "",
      stock: stock.get(i.id) ?? 0, images: i.images.map((im) => im.id),
    })),
  });
});

// One-off: add sample inventory data to an existing business (idempotent).
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findFirst();
  if (!business) throw new Error("No business found — run prisma db seed first");
  const branch = await prisma.branch.findFirst({ where: { businessId: business.id, code: "MAIN" } });
  const owner = await prisma.user.findFirst({ where: { businessId: business.id, username: "owner" } });
  if (!branch || !owner) throw new Error("Seed users/branches missing");

  if (await prisma.item.count({ where: { businessId: business.id } })) {
    console.log("Inventory already seeded");
    return;
  }

  const unitPcs = await prisma.unit.create({ data: { businessId: business.id, name: "pcs" } });
  const unitBox = await prisma.unit.create({ data: { businessId: business.id, name: "box" } });
  const catDrinks = await prisma.itemCategory.create({ data: { businessId: business.id, name: "Drinks" } });
  const catSnacks = await prisma.itemCategory.create({ data: { businessId: business.id, name: "Snacks" } });
  const items = [
    ["Cola 330ml", "DRK-001", catDrinks.id, unitPcs.id, 50_000n, 70_000n, 100],
    ["Water 1L", "DRK-002", catDrinks.id, unitPcs.id, 25_000n, 40_000n, 200],
    ["Potato Chips", "SNK-001", catSnacks.id, unitPcs.id, 80_000n, 120_000n, 50],
    ["Biscuit Box", "SNK-002", catSnacks.id, unitBox.id, 300_000n, 420_000n, 20],
  ] as const;
  for (const [name, sku, categoryId, unitId, cost, price, qty] of items) {
    const item = await prisma.item.create({
      data: { businessId: business.id, name, sku, categoryId, unitId, costPrice: cost, sellingPrice: price, minStock: 10 },
    });
    await prisma.stockLevel.create({ data: { itemId: item.id, branchId: branch.id, quantity: qty } });
    await prisma.stockMovement.create({
      data: {
        businessId: business.id, itemId: item.id, branchId: branch.id,
        type: "ADJUSTMENT", quantity: qty, qtyAfter: qty, notes: "Opening stock", createdById: owner.id,
      },
    });
  }
  console.log("Inventory samples added");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

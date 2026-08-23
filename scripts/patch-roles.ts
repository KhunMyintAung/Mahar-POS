import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const NEW = ["item.view","item.manage","stock.view","stock.adjust","purchase.view","purchase.create","purchase.cancel","sale.view","sale.create","sale.cancel"];
const BY_ROLE: Record<string, string[]> = {
  Owner: NEW,
  Admin: NEW,
  Cashier: ["item.view","stock.view","sale.view","sale.create"],
  Accountant: ["item.view","stock.view","purchase.view","sale.view"],
  Viewer: ["item.view","stock.view","purchase.view","sale.view"],
  Agent: [],
};
async function main() {
  const roles = await p.role.findMany();
  for (const r of roles) {
    const cur: string[] = JSON.parse(r.permissions);
    const add = (BY_ROLE[r.name] ?? []).filter((x) => !cur.includes(x));
    if (add.length) {
      await p.role.update({ where: { id: r.id }, data: { permissions: JSON.stringify([...cur, ...add]) } });
      console.log(r.name, "+", add.length);
    }
  }
}
main().then(() => process.exit(0));

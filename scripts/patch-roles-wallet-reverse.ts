// One-off: backfill wallet.withdraw (in case any tenant's roles predate it)
// and the new wallet.reverse permission onto existing tenants' system roles.
// New signups get both automatically via DEFAULT_ROLES. Run once after
// deploying the migration that adds the reverse/void endpoints.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const BY_ROLE: Record<string, string[]> = {
  Owner: ["wallet.withdraw", "wallet.reverse"],
  Admin: ["wallet.withdraw", "wallet.reverse"],
  Cashier: ["wallet.withdraw"],
  Accountant: ["wallet.withdraw"],
};
async function main() {
  const roles = await p.role.findMany({ where: { name: { in: Object.keys(BY_ROLE) } } });
  for (const r of roles) {
    const cur: string[] = JSON.parse(r.permissions);
    const add = (BY_ROLE[r.name] ?? []).filter((x) => !cur.includes(x));
    if (add.length) {
      await p.role.update({ where: { id: r.id }, data: { permissions: JSON.stringify([...cur, ...add]) } });
      console.log(r.businessId, r.name, "+", add.join(", "));
    }
  }
}
main().then(() => process.exit(0));

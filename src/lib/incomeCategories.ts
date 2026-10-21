import type { Tx } from "@/lib/prisma";

/** The standard daily income and expense categories every shop has.
 *
 *  Each carries a fixed key, so the shop can rename it ("Daily Bill Income" → "Bill
 *  payments") and the dashboard still knows what it is. They can be renamed but never
 *  deleted; a shop's own extra categories can be both. */
export type StandardKey = "DAILY_SERVICE" | "DAILY_SALE" | "DAILY_BILL" | "DAILY_GENERAL";
export type CategoryType = "INCOME" | "EXPENSE";

export const STANDARD_CATEGORIES: { type: CategoryType; key: StandardKey; name: string }[] = [
  { type: "INCOME", key: "DAILY_SERVICE", name: "Daily Service Income" },
  { type: "INCOME", key: "DAILY_SALE", name: "Daily Sale Income" },
  { type: "INCOME", key: "DAILY_BILL", name: "Daily Bill Income" },
  { type: "INCOME", key: "DAILY_GENERAL", name: "Daily General Income" },
  { type: "EXPENSE", key: "DAILY_SERVICE", name: "Daily Service Expense" },
  { type: "EXPENSE", key: "DAILY_SALE", name: "Daily Sale Expense" },
  { type: "EXPENSE", key: "DAILY_BILL", name: "Daily Bill Expense" },
  { type: "EXPENSE", key: "DAILY_GENERAL", name: "Daily General Expense" },
];

export type IncomeBucket = "sales" | "service" | "topup" | "other";

/** Which dashboard total an income category counts towards. Bills sit with top-up,
 *  the other money a phone shop takes for a service paid on someone else's behalf. */
export function bucketForKey(key: string | null | undefined): IncomeBucket {
  if (key === "DAILY_SALE") return "sales";
  if (key === "DAILY_SERVICE") return "service";
  if (key === "DAILY_BILL") return "topup";
  return "other";
}

/** Makes sure the shop has all eight. A category it already has under a standard name
 *  (say "Daily Sale Income" from before keys existed) takes the key rather than being
 *  doubled; a standard one that was hidden comes back. */
export async function ensureStandardCategories(tx: Tx, businessId: string) {
  const existing = await tx.category.findMany({ where: { businessId }, select: { id: true, type: true, name: true, systemKey: true, active: true } });
  for (const std of STANDARD_CATEGORIES) {
    const keyed = existing.find((c) => c.type === std.type && c.systemKey === std.key);
    if (keyed) {
      if (!keyed.active) await tx.category.update({ where: { id: keyed.id }, data: { active: true } });
      continue;
    }
    const named = existing.find((c) => c.type === std.type && c.name.toLowerCase() === std.name.toLowerCase() && !c.systemKey);
    if (named) {
      await tx.category.update({ where: { id: named.id }, data: { systemKey: std.key, active: true } });
    } else {
      await tx.category.create({ data: { businessId, type: std.type, name: std.name, systemKey: std.key } });
    }
  }
}

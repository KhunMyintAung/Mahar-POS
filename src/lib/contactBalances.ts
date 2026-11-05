import { prisma } from "@/lib/prisma";

export interface ContactBalance {
  /** What the contact still owes the shop (open credit sales / receivables); null when hidden. */
  theyOwe: bigint | null;
  /** What the shop still owes the contact (open payables, unpaid purchases among them). */
  weOwe: bigint | null;
  openCount: number;
  /** Sales to them and purchases from them, not cancelled. */
  sold: bigint;
  bought: bigint;
}

const OPEN = { notIn: ["PAID", "CANCELLED", "WRITTEN_OFF"] };

export async function contactBalances(
  businessId: string, ids: string[], show: { receivable: boolean; payable: boolean }
): Promise<Map<string, ContactBalance>> {
  const filter = { in: ids };
  const [rec, pay, sales, purchases] = await Promise.all([
    show.receivable
      ? prisma.receivable.groupBy({ by: ["customerId"], where: { businessId, deletedAt: null, status: OPEN, customerId: filter }, _sum: { remainingAmount: true }, _count: true })
      : [],
    show.payable
      ? prisma.payable.groupBy({ by: ["supplierId"], where: { businessId, deletedAt: null, status: OPEN, supplierId: filter }, _sum: { remainingAmount: true }, _count: true })
      : [],
    prisma.sale.groupBy({ by: ["customerId"], where: { businessId, deletedAt: null, status: { not: "CANCELLED" }, customerId: filter }, _sum: { total: true } }),
    prisma.purchase.groupBy({ by: ["supplierId"], where: { businessId, deletedAt: null, status: { not: "CANCELLED" }, supplierId: filter }, _sum: { total: true } }),
  ]);
  const out = new Map<string, ContactBalance>();
  for (const id of ids) {
    const r = rec.find((x) => x.customerId === id);
    const p = pay.find((x) => x.supplierId === id);
    out.set(id, {
      theyOwe: show.receivable ? r?._sum.remainingAmount ?? 0n : null,
      weOwe: show.payable ? p?._sum.remainingAmount ?? 0n : null,
      openCount: (r?._count ?? 0) + (p?._count ?? 0),
      sold: sales.find((x) => x.customerId === id)?._sum.total ?? 0n,
      bought: purchases.find((x) => x.supplierId === id)?._sum.total ?? 0n,
    });
  }
  return out;
}

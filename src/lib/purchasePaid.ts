import { prisma } from "@/lib/prisma";

type PurchaseRow = { id: string; payableId: string | null; total: bigint; paidAmount: bigint; paymentStatus: string };

/** How much of each purchase is paid: what was paid at purchase (Purchase.paidAmount, which
 *  stays as it was, as the purchase's own expense is that amount) and what has been paid to the
 *  supplier since on the purchase's payable. Worked out when read, so a payment, or a payment
 *  taken back, always shows on the purchase. */
export async function withPaymentsSince<T extends PurchaseRow>(businessId: string, purchases: T[]) {
  const ids = [...new Set(purchases.map((p) => p.payableId).filter((id): id is string => Boolean(id)))];
  const payables = ids.length
    ? await prisma.payable.findMany({ where: { id: { in: ids }, businessId }, select: { id: true, paidAmount: true } })
    : [];
  const since = new Map(payables.map((p) => [p.id, p.paidAmount]));
  return purchases.map((p) => {
    const later = (p.payableId && since.get(p.payableId)) || 0n;
    const paid = p.paidAmount + later;
    return {
      ...p,
      /** Paid in all: at purchase and to the supplier since. */
      paidAmount: paid,
      /** Paid when the purchase was made, from walletId. */
      paidAtPurchase: p.paidAmount,
      /** Paid to the supplier since (Payables). */
      paidSince: later,
      paymentStatus: paid >= p.total ? "PAID" : paid > 0n ? "PARTIAL" : "UNPAID",
    };
  });
}

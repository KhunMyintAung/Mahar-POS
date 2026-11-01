import { prisma } from "./prisma";

export interface CreditSale {
  saleNo: string;
  date: string;
  items: { name: string; quantity: number; lineTotal: bigint }[];
}

/** What was bought on credit: for each receivable a POS sale left unpaid, that sale's
 *  number, day and items, so a debt says what it is for and not just how much. */
export async function creditSalesFor(receivableIds: string[]): Promise<Map<string, CreditSale>> {
  if (!receivableIds.length) return new Map();
  const sales = await prisma.sale.findMany({
    where: { receivableId: { in: receivableIds }, deletedAt: null },
    select: {
      receivableId: true, txnNo: true, date: true,
      lines: { select: { quantity: true, lineTotal: true, item: { select: { name: true } } } },
    },
  });
  return new Map(sales.map((s) => [s.receivableId!, {
    saleNo: s.txnNo,
    date: s.date,
    items: s.lines.map((l) => ({ name: l.item.name, quantity: l.quantity, lineTotal: l.lineTotal })),
  }]));
}

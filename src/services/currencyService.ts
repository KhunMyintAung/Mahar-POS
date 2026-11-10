import { prisma, type Tx } from "@/lib/prisma";
import { asCurrency, type Currency } from "@/lib/currency";

/** The shop's main currency: what reports, totals and the till count in. */
export async function businessCurrency(businessId: string, tx: Tx | typeof prisma = prisma): Promise<Currency> {
  const b = await tx.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  return asCurrency(b?.currency);
}

/** True when nothing has been recorded yet: no wallet movement, sale, purchase or income /
 *  expense entry. Only then may the main currency change; once there are records, their
 *  amounts are in the old currency, and relabelling them would misstate every figure. */
export async function booksAreEmpty(businessId: string): Promise<boolean> {
  const where = { businessId };
  const [ledger, sales, purchases, entries] = await Promise.all([
    prisma.walletLedgerEntry.count({ where }),
    prisma.sale.count({ where }),
    prisma.purchase.count({ where }),
    prisma.incomeExpense.count({ where }),
  ]);
  return ledger + sales + purchases + entries === 0;
}

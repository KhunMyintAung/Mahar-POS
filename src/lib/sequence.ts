import { Tx } from "./prisma";

const DEFAULT_PREFIXES: Record<string, string> = {
  REPAIR: "RPR",
  BILLER: "BIL",
  TRANSFER: "WTR",
  CREDIT: "CRD",
  PAYABLE: "PAY",
  INCOME: "INC",
  EXPENSE: "EXP",
  WITHDRAW: "WTH",
  CLOSE: "CLS",
  PURCHASE: "PUR",
  SALE: "SAL",
  STOCK_TRANSFER: "STR",
};

/** Get the next transaction number, e.g. "3D-000042". Must run inside a transaction.
 *
 *  `format` lets a shop number something its own way (MS001) while sharing the same
 *  counter, so switching formats never reuses a number. */
export async function nextNumber(
  tx: Tx,
  businessId: string,
  key: string,
  format?: (n: number) => string
): Promise<string> {
  const prefix = DEFAULT_PREFIXES[key] ?? key;
  // upsert returns the row after mutation: created rows have next=2 (number 1
  // consumed), updated rows were incremented — consumed number is next-1 either way.
  const seq = await tx.numberSequence.upsert({
    where: { businessId_key: { businessId, key } },
    create: { businessId, key, prefix, next: 2 },
    update: { next: { increment: 1 } },
  });
  const n = seq.next - 1;
  return format ? format(n) : `${seq.prefix}-${String(n).padStart(6, "0")}`;
}

/** Set aside `count` numbers at once (a device's block for working without the internet).
 *  Returns the first; the block is first … first + count - 1. Must run inside a transaction. */
export async function reserveNumbers(tx: Tx, businessId: string, key: string, count: number): Promise<number> {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive whole number");
  const prefix = DEFAULT_PREFIXES[key] ?? key;
  const seq = await tx.numberSequence.upsert({
    where: { businessId_key: { businessId, key } },
    create: { businessId, key, prefix, next: count + 1 },
    update: { next: { increment: count } },
  });
  return seq.next - count;
}

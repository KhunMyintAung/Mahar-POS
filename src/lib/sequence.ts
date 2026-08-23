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
};

/** Get the next transaction number, e.g. "3D-000042". Must run inside a transaction. */
export async function nextNumber(tx: Tx, businessId: string, key: string): Promise<string> {
  const prefix = DEFAULT_PREFIXES[key] ?? key;
  // upsert returns the row after mutation: created rows have next=2 (number 1
  // consumed), updated rows were incremented — consumed number is next-1 either way.
  const seq = await tx.numberSequence.upsert({
    where: { businessId_key: { businessId, key } },
    create: { businessId, key, prefix, next: 2 },
    update: { next: { increment: 1 } },
  });
  return `${seq.prefix}-${String(seq.next - 1).padStart(6, "0")}`;
}

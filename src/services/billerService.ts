import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { postLedger } from "./walletService";

/** Top-up billers: the float a phone shop holds with each operator.
 *
 *  Two figures move on every trade and they are rarely equal. The float moves by the face
 *  value — the credit the operator actually gives or takes — and the drawer moves by the
 *  cash. An operator selling 100,000 of credit for 98,000 is the shop's entire margin on
 *  air-time, so both are recorded and the difference is stored as the profit rather than
 *  left to be re-derived by whoever writes the next report.
 */

export const BILLER_TYPES = ["TOPUP_CARD", "ELOAD"] as const;
export type BillerType = (typeof BILLER_TYPES)[number];

export const BILLER_TXN_KINDS = ["TOPUP", "SALE", "ADJUST"] as const;
export type BillerTxnKind = (typeof BILLER_TXN_KINDS)[number];

/** How the float and the drawer move for each kind of movement.
 *
 *  TOPUP  — the shop buys credit: float up by the face value, cash out of a wallet.
 *  SALE   — the shop sells credit on: float down by the face value, cash into a wallet.
 *  ADJUST — a correction after counting against the operator's own statement. The float
 *           moves and nothing else does, because no money changed hands.
 */
export function floatDelta(kind: BillerTxnKind, faceAmount: bigint): bigint {
  if (kind === "TOPUP") return faceAmount;
  if (kind === "SALE") return -faceAmount;
  return faceAmount; // ADJUST carries its own sign
}

/** The margin on a trade, from the shop's point of view.
 *
 *  Buying: whatever credit was received above what was paid. Selling: whatever cash was
 *  taken above the credit given away — usually nothing, and negative when a customer is
 *  given a discount, which is worth seeing rather than rounding away.
 */
export function txnProfit(kind: BillerTxnKind, faceAmount: bigint, cashAmount: bigint): bigint {
  if (kind === "TOPUP") return faceAmount - cashAmount;
  if (kind === "SALE") return cashAmount - faceAmount;
  return 0n;
}

export async function createBiller(
  tx: Tx,
  opts: {
    businessId: string;
    userId: string;
    branchId?: string;
    name: string;
    type: BillerType;
    openingBalance: bigint;
    notes?: string;
  }
) {
  const name = opts.name.trim();
  if (!name) throw new ApiError(422, "A biller needs a name");

  const clash = await tx.biller.findFirst({
    where: { businessId: opts.businessId, name, deletedAt: null },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, `There is already a biller called ${name}`);

  const biller = await tx.biller.create({
    data: {
      businessId: opts.businessId,
      branchId: opts.branchId,
      name,
      type: opts.type,
      openingBalance: opts.openingBalance,
      currentBalance: opts.openingBalance,
      notes: opts.notes,
    },
  });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: opts.branchId,
    action: "CREATE",
    module: "biller",
    resourceType: "Biller",
    resourceId: biller.id,
    after: { name: biller.name, type: biller.type, opening: biller.openingBalance.toString() },
  });
  return biller;
}

/** Record a movement of a float, and the cash that went with it.
 *
 *  The float balance is not guarded against going negative. An operator that lets a shop
 *  sell before it has paid leaves the float below zero until settlement, and refusing to
 *  record that would only mean the shop's books stop matching the operator's.
 */
export async function recordBillerTxn(
  tx: Tx,
  opts: {
    businessId: string;
    userId: string;
    branchId?: string;
    billerId: string;
    kind: BillerTxnKind;
    faceAmount: bigint;
    cashAmount: bigint;
    walletId?: string;
    customerPhone?: string;
    note?: string;
  }
) {
  const biller = await tx.biller.findFirst({
    where: { id: opts.billerId, businessId: opts.businessId, deletedAt: null },
  });
  if (!biller) throw new ApiError(404, "Biller not found");
  if (!biller.active) throw new ApiError(422, `${biller.name} is switched off`);

  if (opts.kind !== "ADJUST" && opts.faceAmount <= 0n) {
    throw new ApiError(422, "Amount must be greater than zero");
  }
  if (opts.cashAmount < 0n) throw new ApiError(422, "Cash cannot be negative");
  if (opts.kind !== "ADJUST" && opts.cashAmount > 0n && !opts.walletId) {
    throw new ApiError(422, "Choose the wallet the cash moved through");
  }
  if (opts.kind === "ADJUST" && opts.faceAmount === 0n) {
    throw new ApiError(422, "An adjustment of zero changes nothing");
  }

  const delta = floatDelta(opts.kind, opts.faceAmount);
  const balanceAfter = biller.currentBalance + delta;
  const profit = txnProfit(opts.kind, opts.faceAmount, opts.cashAmount);

  await tx.biller.update({
    where: { id: biller.id },
    data: { currentBalance: balanceAfter },
  });

  const txnNo = await nextNumber(tx, opts.businessId, "BILLER");
  const record = await tx.billerTxn.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId ?? biller.branchId,
      billerId: biller.id,
      kind: opts.kind,
      faceAmount: opts.kind === "ADJUST" ? delta : opts.faceAmount,
      cashAmount: opts.cashAmount,
      profit,
      walletId: opts.walletId,
      balanceAfter,
      customerPhone: opts.customerPhone,
      note: opts.note,
      createdById: opts.userId,
    },
  });

  // Buying credit takes money out of the drawer; selling it puts money in. An adjustment
  // is a correction to the float alone and never touches a wallet.
  if (opts.kind !== "ADJUST" && opts.cashAmount > 0n && opts.walletId) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: opts.walletId,
      direction: opts.kind === "TOPUP" ? "CREDIT" : "DEBIT",
      amount: opts.cashAmount,
      refType: opts.kind === "TOPUP" ? "BILLER_TOPUP" : "BILLER_SALE",
      refId: record.id,
      description: `${txnNo} ${biller.name} ${opts.kind === "TOPUP" ? "float top-up" : "top-up sale"}`,
      createdById: opts.userId,
    });
  }

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: opts.branchId ?? biller.branchId ?? undefined,
    action: opts.kind,
    module: "biller",
    resourceType: "BillerTxn",
    resourceId: record.id,
    after: {
      txnNo,
      biller: biller.name,
      face: record.faceAmount.toString(),
      cash: record.cashAmount.toString(),
      profit: profit.toString(),
      balanceAfter: balanceAfter.toString(),
    },
  });

  return record;
}

import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import Decimal from "decimal.js";
import { isValidDecimalString, mulMinor, toMinor } from "@/lib/money";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { todayBusinessDate } from "@/lib/dates";
import { recordTransferFeeExpense, reverseIncomeExpense } from "./incomeExpenseService";

// The single choke point for wallet balance changes. A wallet balance is never
// mutated except through postLedger, inside a database transaction, so the
// ledger always reconciles to the balance.

export interface LedgerPost {
  businessId: string;
  walletId: string;
  direction: "DEBIT" | "CREDIT"; // DEBIT = money in, CREDIT = money out
  amount: bigint; // positive, minor units of the wallet currency
  refType: string;
  refId?: string;
  description?: string;
  createdById: string;
  allowNegative?: boolean;
  /** For a record entered for an earlier day: when the money moved. */
  createdAt?: Date;
}

export async function postLedger(tx: Tx, post: LedgerPost) {
  if (post.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");

  const wallet = await tx.wallet.findUnique({ where: { id: post.walletId } });
  if (!wallet || wallet.businessId !== post.businessId || wallet.deletedAt)
    throw new ApiError(404, "Wallet not found");
  if (!wallet.active) throw new ApiError(422, `Wallet ${wallet.name} is inactive`);

  const delta = post.direction === "DEBIT" ? post.amount : -post.amount;
  const newBalance = wallet.currentBalance + delta;
  if (newBalance < 0n && !post.allowNegative) {
    throw new ApiError(422, `Insufficient balance in wallet ${wallet.name}`);
  }

  // Optimistic-lock the balance update: fail if another transaction touched it.
  const updated = await tx.wallet.updateMany({
    where: { id: wallet.id, version: wallet.version },
    data: { currentBalance: newBalance, version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ApiError(409, "Wallet was changed by another operation. Please retry.");
  }

  const entry = await tx.walletLedgerEntry.create({
    data: {
      walletId: wallet.id,
      businessId: post.businessId,
      branchId: wallet.branchId,
      direction: post.direction,
      amount: post.amount,
      balanceAfter: newBalance,
      refType: post.refType,
      refId: post.refId,
      description: post.description,
      createdById: post.createdById,
      ...(post.createdAt ? { createdAt: post.createdAt } : {}),
    },
  });
  return { entry, wallet: { ...wallet, currentBalance: newBalance } };
}

/** Reverse all ledger entries with a given refType/refId (used for reversals/reopen). */
export async function reverseLedgerEntries(
  tx: Tx,
  businessId: string,
  refType: string,
  refId: string,
  createdById: string,
  reasonNote: string
) {
  const entries = await tx.walletLedgerEntry.findMany({ where: { businessId, refType, refId } });
  for (const e of entries) {
    await postLedger(tx, {
      businessId,
      walletId: e.walletId,
      direction: e.direction === "DEBIT" ? "CREDIT" : "DEBIT",
      amount: e.amount,
      refType: "REVERSAL",
      refId: e.id,
      description: `Reversal: ${reasonNote}`,
      createdById,
      allowNegative: true,
    });
  }
  return entries.length;
}

export async function createTransfer(
  tx: Tx,
  opts: {
    businessId: string;
    userId: string;
    sourceWalletId: string;
    destWalletId: string;
    amount: string;
    rate?: string;
    fee: string;
    reference?: string;
    notes?: string;
  }
) {
  if (opts.sourceWalletId === opts.destWalletId)
    throw new ApiError(422, "Source and destination wallets must differ");

  const source = await tx.wallet.findFirst({
    where: { id: opts.sourceWalletId, businessId: opts.businessId, deletedAt: null, active: true },
  });
  const dest = await tx.wallet.findFirst({
    where: { id: opts.destWalletId, businessId: opts.businessId, deletedAt: null, active: true },
  });
  if (!source || !dest) throw new ApiError(404, "Wallet not found");

  // The fee is added on top of the transfer amount: the source pays
  // amount + fee, and the destination receives the full amount unreduced.
  const enteredAmount = toMinor(opts.amount);
  const fee = toMinor(opts.fee);
  const sourceAmount = enteredAmount + fee;
  let destAmount = enteredAmount;
  let rate: string | undefined;
  if (source.currency !== dest.currency) {
    if (!opts.rate || !isValidDecimalString(opts.rate) || new Decimal(opts.rate).lte(0))
      throw new ApiError(422, "A valid exchange rate is required for cross-currency transfers");
    rate = opts.rate;
    destAmount = mulMinor(enteredAmount, rate);
  }
  if (destAmount <= 0n) throw new ApiError(422, "Transfer amount must be greater than zero");

  const txnNo = await nextNumber(tx, opts.businessId, "TRANSFER");
  const transfer = await tx.walletTransfer.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: source.branchId,
      sourceWalletId: source.id,
      destWalletId: dest.id,
      sourceAmount,
      destAmount,
      rate,
      fee,
      reference: opts.reference,
      notes: opts.notes,
      createdById: opts.userId,
    },
  });

  // Only the amount moved is a transfer; the fee leaves the source as an expense of its own
  // (Transfer Fee), so it shows in profit and in cash out.
  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: source.id,
    direction: "CREDIT",
    amount: enteredAmount,
    refType: "TRANSFER_OUT",
    refId: transfer.id,
    description: `${txnNo} → ${dest.name}`,
    createdById: opts.userId,
  });
  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: dest.id,
    direction: "DEBIT",
    amount: destAmount,
    refType: "TRANSFER_IN",
    refId: transfer.id,
    description: `${txnNo} ← ${source.name}`,
    createdById: opts.userId,
  });
  let result = transfer;
  if (fee > 0n) {
    const expense = await recordTransferFeeExpense(tx, {
      businessId: opts.businessId, userId: opts.userId, amount: fee, walletId: source.id,
      date: todayBusinessDate(), reference: txnNo, description: `Fee on ${txnNo} · ${source.name} → ${dest.name}`,
    });
    result = await tx.walletTransfer.update({ where: { id: transfer.id }, data: { feeExpenseId: expense.id } });
  }
  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: source.branchId,
    action: "CREATE",
    module: "wallet",
    resourceType: "WalletTransfer",
    resourceId: transfer.id,
    after: { txnNo, sourceAmount, destAmount, rate, fee },
  });
  return result;
}

/** Void a transfer: reverses both wallet movements exactly as posted, and the fee's expense.
 *  (A transfer made before fees were filed as expense carries its fee in TRANSFER_OUT.) */
export async function reverseTransfer(
  tx: Tx,
  opts: { transferId: string; reason: string; userId: string; businessId: string }
) {
  const transfer = await tx.walletTransfer.findUnique({ where: { id: opts.transferId } });
  if (!transfer || transfer.businessId !== opts.businessId) throw new ApiError(404, "Transfer not found");
  if (transfer.status === "REVERSED") throw new ApiError(422, "Transfer has already been reversed");
  if (!opts.reason.trim()) throw new ApiError(422, "A reason is required to reverse a transfer");

  await reverseLedgerEntries(tx, opts.businessId, "TRANSFER_OUT", transfer.id, opts.userId, opts.reason);
  await reverseLedgerEntries(tx, opts.businessId, "TRANSFER_IN", transfer.id, opts.userId, opts.reason);
  if (transfer.feeExpenseId) {
    const fee = await tx.incomeExpense.findUnique({ where: { id: transfer.feeExpenseId } });
    if (fee && fee.status === "COMPLETED")
      await reverseIncomeExpense(tx, { id: fee.id, reason: opts.reason, userId: opts.userId, businessId: opts.businessId });
  }

  await tx.walletTransfer.update({ where: { id: transfer.id }, data: { status: "REVERSED" } });

  await audit(tx, {
    businessId: opts.businessId,
    userId: opts.userId,
    branchId: transfer.branchId,
    action: "REVERSE",
    module: "wallet",
    resourceType: "WalletTransfer",
    resourceId: transfer.id,
    reason: opts.reason,
    before: { status: transfer.status },
  });
}

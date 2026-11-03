import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { businessDateOf } from "@/lib/dates";
import { postLedger, reverseLedgerEntries } from "./walletService";
import { recordFeeIncome, reverseIncomeExpense } from "./incomeExpenseService";
import { assertDateOpen } from "./closeGuard";

/** Money transfers and cash-outs done for customers through the shop's KBZPay / Wave account.
 *
 *  TRANSFER — the customer hands over cash, the shop sends it from the account:
 *             the drawer gains the amount, the account loses it.
 *  CASHOUT  — the customer sends to the account, the shop hands over cash:
 *             the account gains the amount, the drawer loses it.
 *
 *  The amount only swaps between the shop's two wallets. The fee is what the shop earns: an
 *  income entry (Transfer & Cash-out Fee, under Other income) into the drawer. So on a
 *  cash-out with a fee the customer takes the amount less the fee. */

export const MONEY_SERVICE_KINDS = ["TRANSFER", "CASHOUT"] as const;
export type MoneyServiceKind = (typeof MONEY_SERVICE_KINDS)[number];

const LABEL: Record<MoneyServiceKind, string> = { TRANSFER: "Money transfer", CASHOUT: "Cash-out" };

export async function recordMoneyService(
  tx: Tx,
  opts: {
    businessId: string;
    userId: string;
    kind: MoneyServiceKind;
    accountWalletId: string;
    cashWalletId: string;
    amount: bigint;
    fee: bigint;
    customerName?: string;
    customerPhone?: string;
    note?: string;
  }
) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  if (opts.fee < 0n) throw new ApiError(422, "The fee cannot be negative");
  if (opts.accountWalletId === opts.cashWalletId) throw new ApiError(422, "Choose two different wallets");
  const [account, cash] = await Promise.all([
    tx.wallet.findFirst({ where: { id: opts.accountWalletId, businessId: opts.businessId, deletedAt: null } }),
    tx.wallet.findFirst({ where: { id: opts.cashWalletId, businessId: opts.businessId, deletedAt: null } }),
  ]);
  if (!account || !cash) throw new ApiError(404, "Wallet not found");
  if (account.currency !== cash.currency) throw new ApiError(422, "Both wallets must be in the same currency");
  const date = businessDateOf(new Date());
  const branchId = cash.branchId ?? account.branchId;
  if (branchId) await assertDateOpen(tx, branchId, date);

  const txnNo = await nextNumber(tx, opts.businessId, "MONEY_SERVICE", (n) => `MSV-${String(n).padStart(6, "0")}`);
  const record = await tx.moneyService.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId,
      kind: opts.kind,
      accountWalletId: account.id,
      cashWalletId: cash.id,
      amount: opts.amount,
      fee: opts.fee,
      customerName: opts.customerName?.trim() || null,
      customerPhone: opts.customerPhone?.trim() || null,
      note: opts.note?.trim() || null,
      createdById: opts.userId,
    },
  });

  const who = [opts.customerName?.trim(), opts.customerPhone?.trim()].filter(Boolean).join(" ");
  const description = `${txnNo} ${LABEL[opts.kind]}${who ? ` · ${who}` : ""}`;
  const transfer = opts.kind === "TRANSFER";
  // Money out first, so a wallet without enough in it stops the record before anything moves.
  await postLedger(tx, {
    businessId: opts.businessId, walletId: transfer ? account.id : cash.id, direction: "CREDIT",
    amount: opts.amount, refType: "MONEY_SERVICE", refId: record.id, description, createdById: opts.userId,
  });
  await postLedger(tx, {
    businessId: opts.businessId, walletId: transfer ? cash.id : account.id, direction: "DEBIT",
    amount: opts.amount, refType: "MONEY_SERVICE", refId: record.id, description, createdById: opts.userId,
  });

  let feeIncomeId: string | null = null;
  if (opts.fee > 0n) {
    const income = await recordFeeIncome(tx, {
      businessId: opts.businessId, userId: opts.userId, branchId, amount: opts.fee, walletId: cash.id,
      date, reference: txnNo, description: `${LABEL[opts.kind]}${who ? ` · ${who}` : ""} (${txnNo})`,
    });
    feeIncomeId = income.id;
    await tx.moneyService.update({ where: { id: record.id }, data: { feeIncomeId } });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: branchId ?? undefined,
    action: "CREATE", module: "wallet", resourceType: "MoneyService", resourceId: record.id,
    after: { txnNo, kind: opts.kind, account: account.name, cash: cash.name, amount: opts.amount, fee: opts.fee },
  });
  return { ...record, feeIncomeId, accountName: account.name, cashName: cash.name };
}

/** Undo one entered by mistake: both wallet movements and the fee are put back, and the
 *  record stays listed, crossed out. */
export async function voidMoneyService(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  if (!opts.reason.trim()) throw new ApiError(422, "A reason is required");
  const record = await tx.moneyService.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!record) throw new ApiError(404, "Record not found");
  if (record.voidedAt) throw new ApiError(422, `${record.txnNo} is already voided`);

  await reverseLedgerEntries(tx, opts.businessId, "MONEY_SERVICE", record.id, opts.userId, opts.reason);
  if (record.feeIncomeId) {
    const fee = await tx.incomeExpense.findUnique({ where: { id: record.feeIncomeId } });
    if (fee && fee.status === "COMPLETED") await reverseIncomeExpense(tx, { id: fee.id, reason: opts.reason, userId: opts.userId, businessId: opts.businessId });
  }
  const voided = await tx.moneyService.update({
    where: { id: record.id },
    data: { voidedAt: new Date(), voidedById: opts.userId, voidReason: opts.reason },
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: record.branchId ?? undefined,
    action: "VOID", module: "wallet", resourceType: "MoneyService", resourceId: record.id,
    reason: opts.reason, after: { txnNo: record.txnNo },
  });
  return voided;
}

import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { postLedger } from "./walletService";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";

// Shared payment logic for receivable collection and payable payment.
// A collection debits (money in) a wallet; a payable payment credits (money out).

/** Record a new credit — money a customer now owes the business.
 *
 *  Two shapes of credit exist:
 *   - A credit *sale*: goods left the shop, no cash moved. Omit walletId and
 *     nothing is posted to the ledger; collection happens later via collectReceivable.
 *   - A cash *advance*: money really left one of our wallets. Pass walletId and the
 *     amount is posted out of that wallet immediately, so the wallet balance and its
 *     ledger match reality. The debt is still recorded at its full amount. */
export async function createReceivable(
  tx: Tx,
  opts: {
    businessId: string;
    branchId: string;
    userId: string;
    customerId: string;
    amount: bigint;
    currency: string;
    creditDate: string;
    dueDate?: string;
    reference?: string;
    notes?: string;
    /** Wallet the cash was handed out from. Omit for a credit sale. */
    walletId?: string;
  }
) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  const customer = await tx.contact.findUnique({ where: { id: opts.customerId } });
  if (!customer || customer.businessId !== opts.businessId || customer.deletedAt)
    throw new ApiError(404, "Customer not found");

  const txnNo = await nextNumber(tx, opts.businessId, "CREDIT");
  const rec = await tx.receivable.create({
    data: {
      txnNo,
      businessId: opts.businessId,
      branchId: opts.branchId,
      customerId: opts.customerId,
      originalAmount: opts.amount,
      remainingAmount: opts.amount,
      currency: opts.currency,
      creditDate: opts.creditDate,
      dueDate: opts.dueDate,
      reference: opts.reference,
      notes: opts.notes,
      agentId: opts.userId,
      createdById: opts.userId,
    },
  });
  // Cash advance: the money physically left a wallet, so record the outflow now.
  if (opts.walletId) {
    await postLedger(tx, {
      businessId: opts.businessId,
      walletId: opts.walletId,
      direction: "CREDIT",
      amount: opts.amount,
      refType: "CREDIT_DISBURSE",
      refId: rec.id,
      description: `Cash given for ${txnNo} (${customer.name})`,
      createdById: opts.userId,
    });
  }

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: opts.branchId,
    action: "CREATE", module: "credit", resourceType: "Receivable", resourceId: rec.id,
    after: { txnNo, customer: customer.name, amount: opts.amount, walletId: opts.walletId ?? null },
  });
  return rec;
}

export async function collectReceivable(
  tx: Tx,
  opts: { receivableId: string; amount: bigint; walletId: string; date: string; notes?: string; userId: string; businessId: string }
) {
  const rec = await tx.receivable.findUnique({ where: { id: opts.receivableId } });
  if (!rec || rec.businessId !== opts.businessId || rec.deletedAt)
    throw new ApiError(404, "Receivable not found");
  if (rec.status === "PAID") throw new ApiError(422, "This credit is already fully collected");
  if (rec.status === "CANCELLED" || rec.status === "WRITTEN_OFF")
    throw new ApiError(422, `This credit is ${rec.status.toLowerCase().replace("_", " ")}`);
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  if (opts.amount > rec.remainingAmount)
    throw new ApiError(422, "Collection amount exceeds the remaining balance");

  const payment = await tx.receivablePayment.create({
    data: {
      receivableId: rec.id,
      amount: opts.amount,
      walletId: opts.walletId,
      date: opts.date,
      notes: opts.notes,
      createdById: opts.userId,
    },
  });

  const remaining = rec.remainingAmount - opts.amount;
  await tx.receivable.update({
    where: { id: rec.id },
    data: {
      paidAmount: rec.paidAmount + opts.amount,
      remainingAmount: remaining,
      status: remaining === 0n ? "PAID" : "PARTIAL",
    },
  });

  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: opts.walletId,
    direction: "DEBIT",
    amount: opts.amount,
    refType: "CREDIT_COLLECT",
    refId: payment.id,
    description: `Collection for ${rec.txnNo}`,
    createdById: opts.userId,
  });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: rec.branchId,
    action: "CREATE", module: "credit", resourceType: "ReceivablePayment", resourceId: payment.id,
    after: { receivable: rec.txnNo, amount: opts.amount, remaining },
  });
  return payment;
}

export async function payPayable(
  tx: Tx,
  opts: { payableId: string; amount: bigint; walletId: string; date: string; notes?: string; userId: string; businessId: string }
) {
  const pay = await tx.payable.findUnique({ where: { id: opts.payableId } });
  if (!pay || pay.businessId !== opts.businessId || pay.deletedAt)
    throw new ApiError(404, "Payable not found");
  if (pay.status === "PAID") throw new ApiError(422, "This payable is already fully paid");
  if (pay.status === "CANCELLED" || pay.status === "WRITTEN_OFF")
    throw new ApiError(422, `This payable is ${pay.status.toLowerCase().replace("_", " ")}`);
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  if (opts.amount > pay.remainingAmount)
    throw new ApiError(422, "Payment amount exceeds the remaining balance");

  const payment = await tx.payablePayment.create({
    data: {
      payableId: pay.id,
      amount: opts.amount,
      walletId: opts.walletId,
      date: opts.date,
      notes: opts.notes,
      createdById: opts.userId,
    },
  });

  const remaining = pay.remainingAmount - opts.amount;
  await tx.payable.update({
    where: { id: pay.id },
    data: {
      paidAmount: pay.paidAmount + opts.amount,
      remainingAmount: remaining,
      status: remaining === 0n ? "PAID" : "PARTIAL",
    },
  });

  await postLedger(tx, {
    businessId: opts.businessId,
    walletId: opts.walletId,
    direction: "CREDIT",
    amount: opts.amount,
    refType: "PAYABLE_PAY",
    refId: payment.id,
    description: `Payment for ${pay.txnNo}`,
    createdById: opts.userId,
  });

  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId: pay.branchId,
    action: "CREATE", module: "payable", resourceType: "PayablePayment", resourceId: payment.id,
    after: { payable: pay.txnNo, amount: opts.amount, remaining },
  });
  return payment;
}

/** Aging bucket for a due date relative to today's business date. */
export function agingBucket(dueDate: string | null, today: string): string {
  if (!dueDate || dueDate >= today) return "CURRENT";
  const days = Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
  if (days <= 7) return "1-7";
  if (days <= 30) return "8-30";
  if (days <= 60) return "31-60";
  return "60+";
}

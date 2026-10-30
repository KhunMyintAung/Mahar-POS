import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { prisma, Tx } from "@/lib/prisma";
import { buildBatch, centiPointsFor, centiToWei, MSP_KEY, parseMspSettings } from "@/lib/msp";

// Mahar Shwe Point: a sale with a customer earns points (an MspAward); the minting job
// collects the awards of customers who have a wallet into one MspBatch and mints it with
// the platform's minter wallet. Only one batch is open at a time, and an open batch is
// resent unchanged until it is on chain: the contract refuses a batch id it has seen, so
// a crash or a lost transaction can delay points but never mint them twice.

const ABI = [
  "function mintBatch(uint256 batchId, address[] to, uint256[] amounts)",
  "function batchUsed(uint256) view returns (bool)",
  "function mintableNow() view returns (uint256)",
];

/** How long a sent batch may stay unmined before it is sent again. */
const RESEND_AFTER_MS = 5 * 60_000;

/** Records the points a sale earns, when the shop has MSP switched on. Points are earned on
 *  what the customer paid at the till, not on credit. */
export async function awardSalePoints(
  tx: Tx,
  opts: { businessId: string; saleId: string; customerId?: string; paidAmount: bigint }
) {
  if (!opts.customerId) return null;
  const row = await tx.systemSetting.findUnique({ where: { businessId_key: { businessId: opts.businessId, key: MSP_KEY } } });
  const cfg = parseMspSettings(row ? JSON.parse(row.value) : undefined);
  if (!cfg.enabled) return null;
  const amount = centiPointsFor(opts.paidAmount, cfg.perPoint);
  if (amount <= 0n) return null;
  return tx.mspAward.create({
    data: { businessId: opts.businessId, saleId: opts.saleId, customerId: opts.customerId, amount },
  });
}

/** A cancelled sale takes back points that have not been minted yet. */
export async function cancelSalePoints(tx: Tx, saleId: string) {
  await tx.mspAward.updateMany({ where: { saleId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

export function mspChainConfig() {
  const key = process.env.MSP_MINTER_KEY, contract = process.env.MSP_CONTRACT;
  if (!key || !contract) return null;
  return {
    key,
    contract,
    rpc: process.env.MSP_RPC || "https://bsc-rpc.publicnode.com",
    chainId: Number(process.env.MSP_CHAIN_ID || 56),
    explorer: process.env.MSP_EXPLORER ?? "https://bscscan.com",
  };
}

const errText = (e: unknown) => {
  const x = e as { shortMessage?: string; reason?: string; message?: string };
  return String(x?.reason || x?.shortMessage || x?.message || e).slice(0, 300);
};

/** One step of the minting job; run once a minute by the scheduler. */
export async function runMspMinting() {
  const cfg = mspChainConfig();
  if (!cfg) return;
  const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
  const signer = new Wallet(cfg.key, provider);
  const msp = new Contract(cfg.contract, ABI, signer);

  let batch = await prisma.mspBatch.findFirst({ where: { status: "OPEN" }, orderBy: { id: "asc" } });
  if (!batch) {
    batch = await openBatch();
    if (!batch) return;
  }

  const markMinted = async (txHash: string | null) => {
    await prisma.$transaction([
      prisma.mspBatch.update({ where: { id: batch!.id }, data: { status: "MINTED", txHash: txHash ?? batch!.txHash, lastError: null } }),
      prisma.mspAward.updateMany({ where: { batchId: batch!.id, status: "SENT" }, data: { status: "MINTED" } }),
    ]);
  };

  // Already sent: wait for it, or find out what became of it.
  if (batch.txHash) {
    const receipt = await provider.getTransactionReceipt(batch.txHash);
    if (receipt?.status === 1) return markMinted(batch.txHash);
    if (!receipt) {
      const age = Date.now() - (batch.sentAt?.getTime() ?? 0);
      if ((await provider.getTransaction(batch.txHash)) && age < RESEND_AFTER_MS) return;
    }
    // Reverted or lost: it may still have landed in another transaction.
    if (await msp.batchUsed(batch.id)) return markMinted(null);
  } else if (await msp.batchUsed(batch.id)) {
    return markMinted(null);
  }

  const recipients = JSON.parse(batch.recipients) as { address: string; amount: string }[];
  const amounts = recipients.map((r) => centiToWei(BigInt(r.amount)));
  const need = centiToWei(batch.total);
  const room: bigint = await msp.mintableNow();
  if (room < need) {
    await prisma.mspBatch.update({
      where: { id: batch.id },
      data: { lastError: room === 0n ? "Minting is paused or today's limit is used up" : "Waiting for tomorrow's daily limit" },
    });
    return;
  }
  try {
    const tx = await msp.mintBatch(batch.id, recipients.map((r) => r.address), amounts);
    await prisma.mspBatch.update({ where: { id: batch.id }, data: { txHash: tx.hash, sentAt: new Date(), lastError: null } });
  } catch (e) {
    await prisma.mspBatch.update({ where: { id: batch.id }, data: { lastError: errText(e) } });
  }
}

/** Gathers pending awards of customers with a wallet into a new open batch. */
async function openBatch() {
  const pending = await prisma.mspAward.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  if (pending.length === 0) return null;
  const contacts = await prisma.contact.findMany({
    where: { id: { in: [...new Set(pending.map((a) => a.customerId))] }, mspAddress: { not: null } },
    select: { id: true, mspAddress: true },
  });
  const addressOf = new Map(contacts.map((c) => [c.id, c.mspAddress!]));
  const ready = pending
    .filter((a) => addressOf.has(a.customerId))
    .map((a) => ({ id: a.id, address: addressOf.get(a.customerId)!, amount: a.amount }));
  const { recipients, ids, total } = buildBatch(ready);
  if (recipients.length === 0) return null;

  return prisma.$transaction(async (tx) => {
    const batch = await tx.mspBatch.create({
      data: { recipients: JSON.stringify(recipients.map((r) => ({ address: r.address, amount: r.amount.toString() }))), total },
    });
    // Only awards still pending move in; one cancelled meanwhile would make the batch wrong.
    const moved = await tx.mspAward.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "SENT", batchId: batch.id } });
    if (moved.count !== ids.length) throw new Error("An award changed while the batch was being built");
    return batch;
  });
}

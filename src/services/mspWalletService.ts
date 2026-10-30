import { ApiError } from "@/lib/api";
import { prisma, Tx } from "@/lib/prisma";
import { fmtMsp } from "@/lib/msp";
import { DEFAULT_WALLET, MSP_WALLET_KEY, holdingsByShop, parseShopWalletId, parseWalletSettings, shopWalletId } from "@/lib/mspWallet";
import { errText, mspChain, mspChainConfig } from "./mspService";
import { accrueRewards, loadRewardSettings, settleOldRewardSends } from "./mspRewardService";

// The shop's MSP wallet. Its balance is what it earned for using Mahar POS, plus MSP other
// shops sent it, minus what it sent and took out. Sends between shops only move balances;
// a withdrawal is the one chain transaction, paid from the platform's rewards wallet, one
// at a time: its nonce is saved before it is sent and a resend reuses it, so it can land
// only once.

/** How long a sent withdrawal may stay unmined before it is sent again with more gas. */
const RESEND_AFTER_MS = 5 * 60_000;
const ACCRUE_EVERY_MS = 10 * 60_000;

export async function loadWalletSettings() {
  const row = await prisma.platformSetting.findUnique({ where: { key: MSP_WALLET_KEY } });
  return row ? parseWalletSettings(JSON.parse(row.value)) : DEFAULT_WALLET;
}

/** Holds the shop's balance still until the transaction ends, so two sends cannot both
 *  spend the same points. */
async function lockShop(tx: Tx, businessId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"msp-wallet:" + businessId}))`;
}

export async function walletBalance(db: Tx, businessId: string) {
  const [rewards, received, sent, out] = await Promise.all([
    db.mspReward.aggregate({ where: { businessId, status: "CREDITED" }, _sum: { amount: true } }),
    db.mspTransfer.aggregate({ where: { toBusinessId: businessId }, _sum: { amount: true } }),
    db.mspTransfer.aggregate({ where: { fromBusinessId: businessId }, _sum: { amount: true } }),
    db.mspWithdrawal.aggregate({ where: { businessId, status: { not: "FAILED" } }, _sum: { amount: true } }),
  ]);
  const s = (a: { _sum: { amount: bigint | null } }) => a._sum.amount ?? 0n;
  return s(rewards) + s(received) - s(sent) - s(out);
}

/** The shop another shop's wallet ID belongs to. */
export async function findShopByWalletId(text: string) {
  const prefix = parseShopWalletId(text);
  if (!prefix) return null;
  const shops = await prisma.business.findMany({ where: { id: { startsWith: prefix } }, select: { id: true, name: true }, take: 2 });
  return shops.length === 1 ? shops[0] : null;
}

export async function sendToShop(opts: { businessId: string; userId: string; to: string; amount: bigint; note?: string }) {
  const to = await findShopByWalletId(opts.to);
  if (!to) throw new ApiError(404, "No shop has that MSP wallet ID");
  if (to.id === opts.businessId) throw new ApiError(422, "That is this shop's own wallet");
  return prisma.$transaction(async (tx) => {
    await lockShop(tx, opts.businessId);
    if (opts.amount > (await walletBalance(tx, opts.businessId))) throw new ApiError(422, "Not enough MSP in the wallet");
    return tx.mspTransfer.create({
      data: { fromBusinessId: opts.businessId, toBusinessId: to.id, amount: opts.amount, note: opts.note || null, createdById: opts.userId },
    });
  });
}

export async function withdraw(opts: { businessId: string; userId: string; amount: bigint }) {
  const [settings, fees] = await Promise.all([loadRewardSettings(opts.businessId), loadWalletSettings()]);
  if (!settings.wallet) throw new ApiError(422, "Save the shop's BNB Chain wallet first");
  if (opts.amount < fees.minCenti) throw new ApiError(422, `The smallest withdrawal is ${fmtMsp(fees.minCenti)} MSP`);
  return prisma.$transaction(async (tx) => {
    await lockShop(tx, opts.businessId);
    if (opts.amount > (await walletBalance(tx, opts.businessId))) throw new ApiError(422, "Not enough MSP in the wallet");
    return tx.mspWithdrawal.create({
      data: { businessId: opts.businessId, amount: opts.amount, fee: fees.feeCenti, address: settings.wallet!, createdById: opts.userId },
    });
  });
}

/** One step of paying withdrawals out. */
export async function sendWithdrawals() {
  const chain = mspChain();
  if (!chain) return;
  const { provider, signer, sendTransfer, cannotPay } = chain;

  // A withdrawal in flight: wait for it, settle it, or resend it under the same nonce.
  const w = await prisma.mspWithdrawal.findFirst({ where: { status: "SENT" }, orderBy: { createdAt: "asc" } });
  if (w) {
    const receipt = w.txHash ? await provider.getTransactionReceipt(w.txHash) : null;
    if (receipt?.status === 1) {
      await prisma.mspWithdrawal.update({ where: { id: w.id }, data: { status: "PAID", lastError: null } });
      return;
    }
    if (receipt && receipt.status === 0) {
      // Failed on chain: the MSP goes back into the shop's wallet.
      await prisma.mspWithdrawal.update({ where: { id: w.id }, data: { status: "FAILED", lastError: "The transfer failed on chain" } });
      return;
    }
    // Every copy sent under this nonce is the same transfer, so a used nonce means it landed.
    if ((await provider.getTransactionCount(signer.address, "latest")) > w.nonce!) {
      await prisma.mspWithdrawal.update({ where: { id: w.id }, data: { status: "PAID", lastError: null } });
      return;
    }
    if (Date.now() - (w.sentAt?.getTime() ?? 0) < RESEND_AFTER_MS) return;
    const prevTx = w.txHash ? await provider.getTransaction(w.txHash) : null;
    try {
      const tx = await sendTransfer(w.address, w.amount - w.fee, w.nonce!, prevTx?.gasPrice ? (prevTx.gasPrice * 12n) / 10n : 0n);
      await prisma.mspWithdrawal.update({ where: { id: w.id }, data: { txHash: tx.hash, sentAt: new Date(), lastError: null } });
    } catch (e) {
      await prisma.mspWithdrawal.update({ where: { id: w.id }, data: { lastError: errText(e) } });
    }
    return;
  }

  const next = await prisma.mspWithdrawal.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (!next) return;
  const problem = await cannotPay(next.amount - next.fee);
  if (problem) {
    await prisma.mspWithdrawal.update({ where: { id: next.id }, data: { lastError: problem } });
    return;
  }
  const nonce = await provider.getTransactionCount(signer.address, "pending");
  // Claim it under the nonce before sending, so a crash after the send cannot pay it twice.
  const claimed = await prisma.mspWithdrawal.updateMany({
    where: { id: next.id, status: "PENDING" },
    data: { status: "SENT", nonce, sentAt: new Date(), txHash: null, lastError: null },
  });
  if (claimed.count !== 1) return;
  try {
    const tx = await sendTransfer(next.address, next.amount - next.fee, nonce);
    await prisma.mspWithdrawal.update({ where: { id: next.id }, data: { txHash: tx.hash } });
  } catch (e) {
    // The send may still have reached the network, so it keeps its nonce: the in-flight
    // check above marks it paid if it lands, or resends under the same nonce.
    await prisma.mspWithdrawal.update({ where: { id: next.id }, data: { lastError: errText(e) } });
  }
}

let lastAccrual = 0;

/** Run once a minute by the scheduler: credit rewards every few minutes, pay out every tick. */
export async function runMspWallets(now = Date.now()) {
  if (now - lastAccrual >= ACCRUE_EVERY_MS) {
    lastAccrual = now;
    await accrueRewards();
  }
  if (await settleOldRewardSends()) return;
  await sendWithdrawals();
}

/** What the shop's MSP wallet page and the Overview show. */
export async function walletSummary(businessId: string) {
  const [balance, settings, fees, rewards, transfers, withdrawals] = await Promise.all([
    walletBalance(prisma, businessId),
    loadRewardSettings(businessId),
    loadWalletSettings(),
    prisma.mspReward.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.mspTransfer.findMany({ where: { OR: [{ fromBusinessId: businessId }, { toBusinessId: businessId }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.mspWithdrawal.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const otherIds = [...new Set(transfers.map((t) => (t.fromBusinessId === businessId ? t.toBusinessId : t.fromBusinessId)))];
  const others = await prisma.business.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true } });
  const nameOf = (id: string) => others.find((b) => b.id === id)?.name ?? shopWalletId(id);
  const explorer = mspChainConfig()?.explorer ?? null;

  const history = [
    ...rewards.map((r) => ({
      id: r.id, at: r.createdAt, kind: "REWARD" as const, amount: r.amount.toString(),
      title: r.kind === "WELCOME" ? "Welcome reward" : `Used Mahar POS · ${r.day}`,
      status: r.status === "CREDITED" ? null : "Paid to chain", link: null as string | null,
    })),
    ...transfers.map((t) => {
      const out = t.fromBusinessId === businessId;
      return {
        id: t.id, at: t.createdAt, kind: out ? ("SENT" as const) : ("RECEIVED" as const),
        amount: (out ? -t.amount : t.amount).toString(),
        title: `${out ? "To" : "From"} ${nameOf(out ? t.toBusinessId : t.fromBusinessId)}${t.note ? ` · ${t.note}` : ""}`,
        status: null as string | null, link: null as string | null,
      };
    }),
    ...withdrawals.map((w) => ({
      id: w.id, at: w.createdAt, kind: "WITHDRAW" as const,
      amount: (w.status === "FAILED" ? 0n : -w.amount).toString(),
      title: `Withdraw to ${w.address.slice(0, 6)}…${w.address.slice(-4)} (fee ${fmtMsp(w.fee)})`,
      status: w.status === "PAID" ? "Done" : w.status === "FAILED" ? "Failed, returned" : w.lastError ? `Waiting: ${w.lastError}` : "On the way",
      link: w.txHash && explorer ? `${explorer}/tx/${w.txHash}` : null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 50);

  return {
    walletId: shopWalletId(businessId),
    balance: balance.toString(),
    rewardsOn: settings.on,
    address: settings.wallet,
    feeCenti: fees.feeCenti.toString(),
    minCenti: fees.minCenti.toString(),
    explorer,
    history,
  };
}

/** For the admin portal: every shop's MSP wallet, the totals the platform owes, the
 *  rewards wallet on chain, and the latest movements across all shops. */
export async function adminMspOverview() {
  const [earned, received, sent, withdrawn, paidOut, fees, businesses, rewards, transfers, withdrawals] = await Promise.all([
    prisma.mspReward.groupBy({ by: ["businessId"], where: { status: "CREDITED" }, _sum: { amount: true } }),
    prisma.mspTransfer.groupBy({ by: ["toBusinessId"], _sum: { amount: true } }),
    prisma.mspTransfer.groupBy({ by: ["fromBusinessId"], _sum: { amount: true } }),
    prisma.mspWithdrawal.groupBy({ by: ["businessId"], where: { status: { not: "FAILED" } }, _sum: { amount: true } }),
    prisma.mspReward.aggregate({ where: { status: { in: ["SENT", "PAID"] } }, _sum: { amount: true } }),
    prisma.mspWithdrawal.aggregate({ where: { status: "PAID" }, _sum: { amount: true, fee: true } }),
    prisma.business.findMany({ select: { id: true, name: true } }),
    prisma.mspReward.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.mspTransfer.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.mspWithdrawal.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  const sum = (a: { _sum: { amount: bigint | null } }) => a._sum.amount ?? 0n;
  const holdings = holdingsByShop({
    earned: earned.map((g) => ({ id: g.businessId, amount: sum(g) })),
    received: received.map((g) => ({ id: g.toBusinessId, amount: sum(g) })),
    sent: sent.map((g) => ({ id: g.fromBusinessId, amount: sum(g) })),
    withdrawn: withdrawn.map((g) => ({ id: g.businessId, amount: sum(g) })),
  });
  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
  const shopName = (id: string) => nameOf.get(id) ?? shopWalletId(id);
  const pendingOut = withdrawals.filter((w) => w.status === "PENDING" || w.status === "SENT").reduce((s, w) => s + w.amount - w.fee, 0n);

  // The rewards wallet on chain, in hundredths, so it reads beside what the shops hold.
  let chain: { address: string; msp: string; bnb: string; explorer: string } | null = null;
  let chainError: string | null = null;
  const c = mspChain();
  if (c) {
    try {
      const [msp, bnb] = await Promise.all([c.msp.balanceOf(c.signer.address) as Promise<bigint>, c.provider.getBalance(c.signer.address)]);
      chain = { address: c.signer.address, msp: (msp / 10n ** 16n).toString(), bnb: (Number(bnb) / 1e18).toFixed(5), explorer: c.cfg.explorer };
    } catch (e) {
      chainError = errText(e);
    }
  }
  const explorer = c?.cfg.explorer ?? null;

  const shops = [...holdings.entries()]
    .map(([id, h]) => ({
      id, name: shopName(id), walletId: shopWalletId(id),
      earned: h.earned.toString(), received: h.received.toString(), sent: h.sent.toString(),
      withdrawn: h.withdrawn.toString(), balance: h.balance.toString(),
    }))
    .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));

  const history = [
    ...rewards.map((r) => ({
      id: r.id, at: r.createdAt, kind: "REWARD", shop: shopName(r.businessId), other: null as string | null,
      amount: r.amount.toString(), detail: r.kind === "WELCOME" ? "Welcome" : `Used Mahar POS ${r.day}`,
      status: r.status === "CREDITED" ? "In wallet" : r.status === "PAID" ? "Paid to chain" : r.status,
      link: r.txHash && explorer ? `${explorer}/tx/${r.txHash}` : null,
    })),
    ...transfers.map((t) => ({
      id: t.id, at: t.createdAt, kind: "TRANSFER", shop: shopName(t.fromBusinessId), other: shopName(t.toBusinessId),
      amount: t.amount.toString(), detail: t.note ?? "", status: "Done", link: null as string | null,
    })),
    ...withdrawals.map((w) => ({
      id: w.id, at: w.createdAt, kind: "WITHDRAW", shop: shopName(w.businessId), other: w.address,
      amount: w.amount.toString(), detail: `Fee ${fmtMsp(w.fee)} · sent ${fmtMsp(w.amount - w.fee)}`,
      status: w.status === "PAID" ? "Done" : w.status === "FAILED" ? "Failed, returned" : w.lastError ? `Waiting: ${w.lastError}` : w.status === "SENT" ? "On the way" : "Queued",
      link: w.txHash && explorer ? `${explorer}/tx/${w.txHash}` : null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 500);

  return {
    totals: {
      held: shops.reduce((s, x) => s + BigInt(x.balance), 0n).toString(),
      earned: shops.reduce((s, x) => s + BigInt(x.earned), 0n).toString(),
      moved: shops.reduce((s, x) => s + BigInt(x.sent), 0n).toString(),
      withdrawn: ((fees._sum.amount ?? 0n) - (fees._sum.fee ?? 0n)).toString(),
      fees: (fees._sum.fee ?? 0n).toString(),
      pendingOut: pendingOut.toString(),
      paidBeforeWallet: sum(paidOut).toString(),
      shops: shops.length,
    },
    chain, chainError, shops, history,
  };
}

import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { prisma } from "@/lib/prisma";
import { centiToWei } from "@/lib/msp";
import { addDays, dateRangeUtc, todayBusinessDate } from "@/lib/dates";
import {
  DAILY_CENTI, MSP_PROMO_KEY, MSP_REWARD_KEY, NOT_WORK_ACTIONS, NOT_WORK_MODULES, WELCOME_CENTI,
  parsePromoShops, parseRewardSettings, rewardDays, type MspRewardSettings,
} from "@/lib/mspRewards";
import { mspChainConfig } from "./mspService";

// MSP for using Mahar POS. accrueRewards() records what each shop in the promotion has
// earned; sendRewards() pays it from the platform's rewards wallet with plain ERC-20
// transfers (the MSP cap is fully minted, so nothing new can be minted). One transfer is
// in flight at a time. Its nonce is saved on the rows before it is sent, and a resend
// reuses that nonce, so whichever copy lands is the only one that can.

const ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

/** How long a sent transfer may stay unmined before it is sent again with more gas. */
const RESEND_AFTER_MS = 5 * 60_000;
/** Accrual reads every promoted shop's audit log, so it runs every few minutes, not every tick. */
const ACCRUE_EVERY_MS = 10 * 60_000;
const TRANSFER_GAS = 80_000n;

const errText = (e: unknown) => {
  const x = e as { shortMessage?: string; reason?: string; message?: string };
  return String(x?.reason || x?.shortMessage || x?.message || e).slice(0, 300);
};

export async function loadPromoShops(): Promise<string[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: MSP_PROMO_KEY } });
  return parsePromoShops(row ? JSON.parse(row.value) : []);
}

export async function setPromo(businessId: string, inPromo: boolean) {
  const shops = new Set(await loadPromoShops());
  if (inPromo) shops.add(businessId); else shops.delete(businessId);
  const value = JSON.stringify([...shops]);
  await prisma.platformSetting.upsert({ where: { key: MSP_PROMO_KEY }, create: { key: MSP_PROMO_KEY, value }, update: { value } });
}

export async function loadRewardSettings(businessId: string): Promise<MspRewardSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: MSP_REWARD_KEY } } });
  return parseRewardSettings(row ? JSON.parse(row.value) : undefined);
}

/** Saves the shop's switch and wallet. The first time it goes on, that day becomes the
 *  first day that can earn. */
export async function saveRewardSettings(businessId: string, input: { on: boolean; wallet: string | null }) {
  const prev = await loadRewardSettings(businessId);
  const next: MspRewardSettings = { on: input.on, wallet: input.wallet, since: prev.since ?? (input.on ? todayBusinessDate() : null) };
  const value = JSON.stringify(next);
  await prisma.systemSetting.upsert({
    where: { businessId_key: { businessId, key: MSP_REWARD_KEY } },
    create: { businessId, key: MSP_REWARD_KEY, value },
    update: { value },
  });
  return { prev, next };
}

/** True when the shop recorded any work on that business date. */
async function workedOn(businessId: string, day: string) {
  const n = await prisma.auditLog.count({
    where: { businessId, createdAt: dateRangeUtc(day), module: { notIn: NOT_WORK_MODULES }, action: { notIn: NOT_WORK_ACTIONS } },
  });
  return n > 0;
}

/** Records the welcome point and the days worked for every promoted shop that has the
 *  reward on with a wallet. Safe to run any number of times: each reward is unique. */
export async function accrueRewards(today = todayBusinessDate()) {
  const shops = await loadPromoShops();
  if (shops.length === 0) return;
  const yesterday = addDays(today, -1);
  for (const businessId of shops) {
    const s = await loadRewardSettings(businessId);
    if (!s.on || !s.wallet) continue;
    const rows: { businessId: string; kind: string; day: string; amount: bigint }[] = [
      { businessId, kind: "WELCOME", day: "", amount: WELCOME_CENTI },
    ];
    for (const day of rewardDays(today, yesterday, s.since)) {
      if (await workedOn(businessId, day)) rows.push({ businessId, kind: "DAILY", day, amount: DAILY_CENTI });
    }
    await prisma.mspReward.createMany({ data: rows, skipDuplicates: true });
  }
}

/** One step of paying rewards out. */
export async function sendRewards() {
  const cfg = mspChainConfig();
  if (!cfg) return;
  const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
  const signer = new Wallet(cfg.key, provider);
  const msp = new Contract(cfg.contract, ABI, signer);

  const sendTransfer = async (to: string, centi: bigint, nonce: number, minGasPrice = 0n) => {
    const fee = await provider.getFeeData();
    const gasPrice = [fee.gasPrice ?? 0n, minGasPrice].reduce((a, b) => (a > b ? a : b));
    const req = await msp.transfer.populateTransaction(to, centiToWei(centi));
    return signer.sendTransaction({ ...req, nonce, gasLimit: TRANSFER_GAS, gasPrice, type: 0 });
  };

  // A transfer in flight: wait for it, settle it, or resend it under the same nonce.
  const inFlight = await prisma.mspReward.findMany({ where: { status: "SENT" }, orderBy: { createdAt: "asc" } });
  if (inFlight.length > 0) {
    const nonce = inFlight[0].nonce!;
    const rows = inFlight.filter((r) => r.nonce === nonce);
    const ids = rows.map((r) => r.id);
    const first = rows[0];
    const receipt = first.txHash ? await provider.getTransactionReceipt(first.txHash) : null;
    if (receipt?.status === 1) {
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", lastError: null } });
      return;
    }
    if (receipt && receipt.status === 0) {
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { status: "PENDING", nonce: null, txHash: null, lastError: "The transfer failed on chain" } });
      return;
    }
    // Every copy sent under this nonce is the same transfer, so a used nonce means it landed.
    if ((await provider.getTransactionCount(signer.address, "latest")) > nonce) {
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", lastError: null } });
      return;
    }
    if (Date.now() - (first.sentAt?.getTime() ?? 0) < RESEND_AFTER_MS) return;
    const total = rows.reduce((s, r) => s + r.amount, 0n);
    const prevTx = first.txHash ? await provider.getTransaction(first.txHash) : null;
    try {
      const tx = await sendTransfer(first.address!, total, nonce, prevTx?.gasPrice ? (prevTx.gasPrice * 12n) / 10n : 0n);
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { txHash: tx.hash, sentAt: new Date(), lastError: null } });
    } catch (e) {
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { lastError: errText(e) } });
    }
    return;
  }

  // Next shop with points waiting and a wallet to send them to.
  const pending = await prisma.mspReward.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 500 });
  for (const businessId of [...new Set(pending.map((r) => r.businessId))]) {
    const s = await loadRewardSettings(businessId);
    if (!s.wallet) continue;
    const rows = pending.filter((r) => r.businessId === businessId);
    const ids = rows.map((r) => r.id);
    const total = rows.reduce((sum, r) => sum + r.amount, 0n);

    const [have, gasBnb, fee] = await Promise.all([msp.balanceOf(signer.address) as Promise<bigint>, provider.getBalance(signer.address), provider.getFeeData()]);
    const problem = have < centiToWei(total)
      ? "The rewards wallet is out of MSP"
      : gasBnb < TRANSFER_GAS * (fee.gasPrice ?? 0n) ? "The rewards wallet is out of BNB for fees" : null;
    if (problem) {
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { lastError: problem } });
      return;
    }

    const nonce = await provider.getTransactionCount(signer.address, "pending");
    // Claim the rows under the nonce before sending, so a crash after the send cannot pay them again.
    const claimed = await prisma.mspReward.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status: "SENT", nonce, address: s.wallet, sentAt: new Date(), txHash: null, lastError: null },
    });
    if (claimed.count !== ids.length) return;
    try {
      const tx = await sendTransfer(s.wallet, total, nonce);
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { txHash: tx.hash } });
    } catch (e) {
      // The send may still have reached the network, so the rows keep their nonce: the
      // in-flight check above marks them paid if it lands, or resends under the same nonce.
      await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { lastError: errText(e) } });
    }
    return;
  }
}

let lastAccrual = 0;

/** Run once a minute by the scheduler. */
export async function runMspRewards(now = Date.now()) {
  if (now - lastAccrual >= ACCRUE_EVERY_MS) {
    lastAccrual = now;
    await accrueRewards();
  }
  await sendRewards();
}

/** What the shop's Settings and Overview show. */
export async function rewardSummary(businessId: string) {
  const [shops, settings, rows] = await Promise.all([
    loadPromoShops(),
    loadRewardSettings(businessId),
    prisma.mspReward.findMany({ where: { businessId }, orderBy: [{ day: "desc" }, { createdAt: "desc" }] }),
  ]);
  const sum = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((s, r) => s + r.amount, 0n);
  const cfg = mspChainConfig();
  return {
    inPromo: shops.includes(businessId),
    on: settings.on,
    wallet: settings.wallet,
    earned: sum(["PENDING", "SENT", "PAID"]).toString(),
    paid: sum(["PAID"]).toString(),
    waiting: sum(["PENDING", "SENT"]).toString(),
    daysWorked: rows.filter((r) => r.kind === "DAILY").length,
    problem: rows.find((r) => r.status !== "PAID" && r.lastError)?.lastError ?? null,
    explorer: cfg?.explorer ?? null,
    contract: cfg?.contract ?? null,
    recent: rows.slice(0, 30).map((r) => ({
      kind: r.kind, day: r.day, amount: r.amount.toString(), status: r.status, txHash: r.txHash, createdAt: r.createdAt,
    })),
  };
}

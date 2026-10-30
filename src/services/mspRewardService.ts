import { prisma } from "@/lib/prisma";
import { addDays, dateRangeUtc, todayBusinessDate } from "@/lib/dates";
import {
  DAILY_CENTI, MSP_REWARD_KEY, NOT_WORK_ACTIONS, NOT_WORK_MODULES, WELCOME_CENTI,
  parseRewardSettings, rewardDays, type MspRewardSettings,
} from "@/lib/mspRewards";
import { errText, mspChain } from "./mspService";

// MSP for using Mahar POS. accrueRewards() credits what each shop that switched it on has
// earned to its MSP wallet balance; nothing goes on chain until the shop withdraws.
// Rewards paid straight to the chain before the wallet existed (SENT) are still settled
// here, by the nonce they were sent under.

/** How long a sent transfer may stay unmined before it is sent again with more gas. */
const RESEND_AFTER_MS = 5 * 60_000;

export async function loadRewardSettings(businessId: string): Promise<MspRewardSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: MSP_REWARD_KEY } } });
  return parseRewardSettings(row ? JSON.parse(row.value) : undefined);
}

/** Saves the shop's switch or withdrawal wallet, keeping the other. The first time it goes
 *  on, that day becomes the first day that can earn. */
export async function saveRewardSettings(businessId: string, input: { on?: boolean; wallet?: string | null }) {
  const prev = await loadRewardSettings(businessId);
  const on = input.on ?? prev.on;
  const next: MspRewardSettings = {
    on,
    wallet: input.wallet !== undefined ? input.wallet : prev.wallet,
    since: prev.since ?? (on ? todayBusinessDate() : null),
  };
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

/** Credits the welcome point and the days worked for every shop that has the reward on.
 *  Safe to run any number of times: each reward is unique. */
export async function accrueRewards(today = todayBusinessDate()) {
  const joined = await prisma.systemSetting.findMany({ where: { key: MSP_REWARD_KEY }, select: { businessId: true, value: true } });
  const yesterday = addDays(today, -1);
  for (const { businessId, value } of joined) {
    const s = parseRewardSettings(JSON.parse(value));
    if (!s.on) continue;
    const rows: { businessId: string; kind: string; day: string; amount: bigint }[] = [
      { businessId, kind: "WELCOME", day: "", amount: WELCOME_CENTI },
    ];
    for (const day of rewardDays(today, yesterday, s.since)) {
      if (await workedOn(businessId, day)) rows.push({ businessId, kind: "DAILY", day, amount: DAILY_CENTI });
    }
    await prisma.mspReward.createMany({ data: rows, skipDuplicates: true });
  }
}

/** Settles a reward transfer sent before the MSP wallet existed. Returns true while one is
 *  still in flight, so nothing else is sent from the platform wallet meanwhile. */
export async function settleOldRewardSends(): Promise<boolean> {
  const inFlight = await prisma.mspReward.findMany({ where: { status: "SENT" }, orderBy: { createdAt: "asc" } });
  if (inFlight.length === 0) return false;
  const chain = mspChain();
  if (!chain) return true;
  const { provider, signer, sendTransfer } = chain;
  const nonce = inFlight[0].nonce!;
  const rows = inFlight.filter((r) => r.nonce === nonce);
  const ids = rows.map((r) => r.id);
  const first = rows[0];
  const receipt = first.txHash ? await provider.getTransactionReceipt(first.txHash) : null;
  if (receipt?.status === 1) {
    await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", lastError: null } });
    return true;
  }
  if (receipt && receipt.status === 0) {
    // Not paid after all: back into the shop's MSP wallet.
    await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { status: "CREDITED", nonce: null, txHash: null, lastError: null } });
    return true;
  }
  // Every copy sent under this nonce is the same transfer, so a used nonce means it landed.
  if ((await provider.getTransactionCount(signer.address, "latest")) > nonce) {
    await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", lastError: null } });
    return true;
  }
  if (Date.now() - (first.sentAt?.getTime() ?? 0) < RESEND_AFTER_MS) return true;
  const total = rows.reduce((s, r) => s + r.amount, 0n);
  const prevTx = first.txHash ? await provider.getTransaction(first.txHash) : null;
  try {
    const tx = await sendTransfer(first.address!, total, nonce, prevTx?.gasPrice ? (prevTx.gasPrice * 12n) / 10n : 0n);
    await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { txHash: tx.hash, sentAt: new Date(), lastError: null } });
  } catch (e) {
    await prisma.mspReward.updateMany({ where: { id: { in: ids } }, data: { lastError: errText(e) } });
  }
  return true;
}

/** What Settings → Points shows. */
export async function rewardSummary(businessId: string) {
  const [settings, rows] = await Promise.all([
    loadRewardSettings(businessId),
    prisma.mspReward.findMany({ where: { businessId }, orderBy: [{ day: "desc" }, { createdAt: "desc" }] }),
  ]);
  return {
    on: settings.on,
    earned: rows.reduce((s, r) => s + r.amount, 0n).toString(),
    daysWorked: rows.filter((r) => r.kind === "DAILY").length,
    recent: rows.slice(0, 30).map((r) => ({ kind: r.kind, day: r.day, amount: r.amount.toString(), createdAt: r.createdAt })),
  };
}

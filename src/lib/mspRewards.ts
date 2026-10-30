import { normalizeMspAddress } from "./msp";

/** Mahar Shwe Point for using Mahar POS: any shop's owner can switch it on in Settings, and
 *  the shop's MSP wallet then gets WELCOME_CENTI once and DAILY_CENTI for
 *  each day it records work. Amounts are in hundredths of a point (100 = 1 MSP). */

/** The shop's reward switch and withdrawal wallet (SystemSetting, written by /api/v1/msp/rewards
 *  and /api/v1/msp/wallet/address). */
export const MSP_REWARD_KEY = "msp_rewards";

export const WELCOME_CENTI = 100n; // 1 MSP
export const DAILY_CENTI = 1n;     // 0.01 MSP

/** Audit modules that are not work: signing in, settings, staff, MSP itself and the admin portal. */
export const NOT_WORK_MODULES = ["auth", "settings", "admin", "account", "users", "msp"];
export const NOT_WORK_ACTIONS = ["LOGIN", "LOGIN_FAILED"];

export interface MspRewardSettings {
  on: boolean;
  wallet: string | null;
  /** The first business date the reward was on; days before it earn nothing. */
  since: string | null;
}

export function parseRewardSettings(raw: unknown): MspRewardSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const wallet = typeof v.wallet === "string" ? normalizeMspAddress(v.wallet) : null;
  const since = typeof v.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.since) ? v.since : null;
  return { on: Boolean(v.on), wallet, since };
}

/** The days a shop can still be given a DAILY point on: today and yesterday (so a day that
 *  ends while the server is down is still counted), never before the day it switched on. */
export function rewardDays(today: string, yesterday: string, since: string | null): string[] {
  return [yesterday, today].filter((d) => since !== null && d >= since);
}

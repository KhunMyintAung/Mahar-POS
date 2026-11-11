// Server side of the shop's time zone (lib/dates.ts): each request, bot message and
// scheduled job runs "in" the zone of the shop it is for, so todayBusinessDate(), a day's
// range and the rest count that shop's days, with nothing passed from call to call.

import * as asyncHooks from "node:async_hooks";
import { prisma } from "./prisma";
import { isTimeZone, setShopZone, setZoneResolver } from "./dates";

// The device engine (a shop kept in the browser) is built without async_hooks. It holds one
// shop only, so its zone is simply set.
const Storage = (asyncHooks as { AsyncLocalStorage?: typeof asyncHooks.AsyncLocalStorage }).AsyncLocalStorage;
const store = Storage ? new Storage<string>() : null;
if (store) setZoneResolver(() => store.getStore());

// A shop's zone is chosen at sign-up and does not change, so it is looked up rarely.
const KEEP_MS = 5 * 60_000;
const known = new Map<string, { zone: string; at: number }>();

/** The shop's time zone, Asia/Yangon for one stored wrongly or not found. */
export async function businessZone(businessId: string): Promise<string> {
  const hit = known.get(businessId);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.zone;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const zone = isTimeZone(business?.timezone) ? business.timezone : "Asia/Yangon";
  known.set(businessId, { zone, at: Date.now() });
  return zone;
}

/** Runs fn with the shop's days counted in its own time zone. */
export async function inShopZone<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
  const zone = await businessZone(businessId);
  if (!store) {
    setShopZone(zone);
    return fn();
  }
  return store.run(zone, fn);
}

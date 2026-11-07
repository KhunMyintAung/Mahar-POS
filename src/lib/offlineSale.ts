import { businessDateOf } from "@/lib/dates";

/** Why a sale rung up without the internet cannot be recorded as sent, or null when it can.
 *  It belongs to the day it was made, so that day must match the time it was made, and a
 *  time still to come (a device clock set wrong) is refused. */
export function offlineSaleProblem(at: Date, date: string, now = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return "The sale's time is not a time";
  if (at.getTime() > now.getTime() + 10 * 60_000) return "The sale's time is still to come; check the device's clock";
  if (businessDateOf(at) !== date) return "The sale's date does not match the time it was made";
  return null;
}

/** Repair statuses and the moves between them.
 *
 *  Kept free of server imports so the repair page can offer exactly the moves the service
 *  will accept.
 */

export const REPAIR_STATUSES = [
  "RECEIVED",
  "CHECKING",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "DONE",
  "CANNOT_REPAIR",
  "DELIVERED",
  "CANCELLED",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

/** Still on the bench. */
export const BENCH_STATUSES: RepairStatus[] = ["RECEIVED", "CHECKING", "IN_PROGRESS", "WAITING_PARTS"];
/** Work is over and the device is waiting to be collected. */
export const READY_STATUSES: RepairStatus[] = ["DONE", "CANNOT_REPAIR"];

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  RECEIVED: "Received",
  CHECKING: "Checking",
  IN_PROGRESS: "In Progress",
  WAITING_PARTS: "Waiting Part",
  DONE: "Completed",
  CANNOT_REPAIR: "Cannot Repair",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** As printed on the voucher and shown to the customer. */
export const REPAIR_STATUS_MM: Record<string, string> = {
  RECEIVED: "လက်ခံပြီး",
  CHECKING: "စစ်ဆေးနေဆဲ",
  IN_PROGRESS: "ပြင်ဆင်နေဆဲ",
  WAITING_PARTS: "ပစ္စည်းစောင့်နေဆဲ",
  DONE: "ပြင်ပြီး",
  CANNOT_REPAIR: "ပြင်၍မရပါ",
  DELIVERED: "ပြန်ပေးပြီး",
  CANCELLED: "ပယ်ဖျက်ပြီး",
};

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type RepairPriority = (typeof PRIORITIES)[number];

/** Where a job may go next.
 *
 *  Anything still in the shop can move freely, so a status picked by mistake is undone with
 *  one more pick. Delivered and cancelled stay final: by then money has moved or the job is
 *  gone, and walking it back would leave the drawer out of step with the job sheet.
 *  A device is only handed back once the work is finished, one way or the other.
 */
export function nextStatuses(from: string): RepairStatus[] {
  if (BENCH_STATUSES.includes(from as RepairStatus)) {
    return ([...BENCH_STATUSES, ...READY_STATUSES, "CANCELLED"] as RepairStatus[]).filter((s) => s !== from);
  }
  if (READY_STATUSES.includes(from as RepairStatus)) {
    return ([...BENCH_STATUSES, ...READY_STATUSES, "DELIVERED", "CANCELLED"] as RepairStatus[]).filter((s) => s !== from);
  }
  return [];
}

export function canMove(from: string, to: string): boolean {
  return nextStatuses(from).includes(to as RepairStatus);
}

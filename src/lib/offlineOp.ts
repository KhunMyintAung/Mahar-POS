import { z } from "zod";
import { ApiError } from "@/lib/api";
import { prisma, Tx } from "@/lib/prisma";

/** A change made on a device without the internet, sent once it is back.
 *
 *  `clientRef` is the device's own name for the change: the same change sent twice (an
 *  answer lost on a bad line, then a retry) is recorded once. `at` is when it really
 *  happened, which is what the record and any money it moved are dated. */
export const offlineOpSchema = z.object({
  clientRef: z.string().trim().min(8).max(64),
  at: z.string().trim().min(1).max(40),
});
export type OfflineOp = z.infer<typeof offlineOpSchema>;

/** How far back a change kept on a device may still be sent. */
export const OFFLINE_MAX_AGE_DAYS = 30;

/** When the change happened, or a reason it cannot be accepted. */
export function offlineOpProblem(at: Date, now = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return "The change's time is not a time";
  if (at.getTime() > now.getTime() + 10 * 60_000) return "The change's time is still to come; check the device's clock";
  if (now.getTime() - at.getTime() > OFFLINE_MAX_AGE_DAYS * 86_400_000) return `The change is older than ${OFFLINE_MAX_AGE_DAYS} days`;
  return null;
}

export function offlineAt(op: OfflineOp): Date {
  const at = new Date(op.at);
  const problem = offlineOpProblem(at);
  if (problem) throw new ApiError(422, problem);
  return at;
}

/** The record an earlier send of this change made, if it was already recorded. */
export async function priorOp(businessId: string, op: OfflineOp | undefined) {
  if (!op) return null;
  const row = await prisma.clientOp.findUnique({ where: { clientRef: op.clientRef } });
  if (!row) return null;
  if (row.businessId !== businessId) throw new ApiError(409, "This change was already sent by another shop");
  return row;
}

/** Marks the change as recorded, inside the same transaction that recorded it, so a second
 *  send racing the first fails on the key and nothing is recorded twice. */
export async function recordOp(tx: Tx, businessId: string, kind: string, op: OfflineOp | undefined, refId: string) {
  if (!op) return;
  await tx.clientOp.create({ data: { clientRef: op.clientRef, businessId, kind, refId } });
}

/** True for the error a racing second send of the same change gets. */
export function isDuplicateOp(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

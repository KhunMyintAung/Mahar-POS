import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

/** Throw when the business date is already closed for this branch. */
export async function assertDateOpen(tx: Tx, branchId: string, date: string) {
  const close = await tx.dailyClose.findUnique({
    where: { branchId_date: { branchId, date } },
  });
  if (close && (close.status === "CLOSED" || close.status === "APPROVED")) {
    throw new ApiError(422, `The daily record for ${date} is already closed`);
  }
}

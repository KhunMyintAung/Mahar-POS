import { prisma } from "./prisma";
import { branchScope, type AuthUser } from "./auth";
import { verifyTrackToken } from "./repairTrack";

/** A voucher number as it is typed: MS0012, ms 12, MS-0012. */
export const VOUCHER_LIKE = /^[A-Za-z]{1,8}[\s-]?\d{1,8}$/;

/** The repair a typed voucher number means, in the branches this user works in. "MS12" finds
 *  MS0012: the same letters and number, without the leading zeros. */
export async function findRepairJob(user: AuthUser, typed: string) {
  const raw = typed.replace(/[\s-]/g, "").toUpperCase();
  const letters = raw.match(/^[A-Z]*/)![0];
  const number = raw.slice(letters.length).replace(/^0+/, "") || "0";
  const where = { businessId: user.businessId, deletedAt: null, ...branchScope(user) };
  const exact = await prisma.repairJob.findFirst({ where: { ...where, jobNo: { equals: raw, mode: "insensitive" } } });
  if (exact) return exact;
  const candidates = await prisma.repairJob.findMany({
    where: { ...where, AND: [{ jobNo: { startsWith: letters, mode: "insensitive" } }, { jobNo: { endsWith: number } }] },
    take: 20,
  });
  return candidates.find((j) => {
    const m = j.jobNo.toUpperCase().replace(/[\s-]/g, "").match(/^([A-Z]*)0*(\d+)$/);
    return m && m[1] === letters && m[2] === number;
  }) ?? null;
}

/** The repair a scanned voucher stands for: the QR (the customer's status link, /track/<token>)
 *  or the voucher number. Null when the code is neither, or the job is not this user's to see. */
export async function findRepairByCode(user: AuthUser, code: string) {
  const text = code.trim();
  const track = text.match(/\/track\/([^/?#\s]+)/);
  if (track) {
    const jobId = verifyTrackToken(decodeURIComponent(track[1]));
    if (!jobId) return null;
    return prisma.repairJob.findFirst({ where: { id: jobId, businessId: user.businessId, deletedAt: null, ...branchScope(user) } });
  }
  return VOUCHER_LIKE.test(text) ? findRepairJob(user, text) : null;
}

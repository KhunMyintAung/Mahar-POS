import { createHmac, timingSafeEqual } from "crypto";

/** The link a customer scans off their voucher to see how the repair is going.
 *
 *  The token is the job id plus a signature over it, so nothing extra is stored and a
 *  reprinted voucher carries the same link. Without AUTH_SECRET no link is issued at all,
 *  because a signature over an empty key would be one anybody could make.
 */

function signature(jobId: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`repair-track:${jobId}`).digest("base64url").slice(0, 22);
}

export function trackToken(jobId: string): string | null {
  const sig = signature(jobId);
  return sig ? `${jobId}.${sig}` : null;
}

/** The job id the token stands for, or null when it was not issued by this server. */
export function verifyTrackToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const jobId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = signature(jobId);
  if (!expected || given.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected)) ? jobId : null;
}

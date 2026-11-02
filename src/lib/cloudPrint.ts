/** Cloud print: a phone's slip goes to the shop's counter printer through the server.
 *
 *  The phone cannot reach the XP-80C, which hangs off a PC by USB and is shared the Windows
 *  way. So the phone hands the slip to the server, and the print station page, left open on
 *  that PC, takes it and prints it there.
 *
 *  Only the shops named in CLOUD_PRINT_BUSINESS_IDS have it. Every other shop sees nothing of
 *  it and prints as before, and a job always belongs to the shop of the user who sent it, so
 *  one shop's slips can never come out of another shop's printer.
 */

/** A station that took a job and did not report back within this is taken to have died
 *  mid-print (the PC slept, the tab closed), and the job goes to the next station poll. */
export const CLAIM_STALE_MS = 60_000;

/** Jobs are cleared a day after they were sent: a slip nobody printed by then is stale. */
export const JOB_TTL_MS = 24 * 3600 * 1000;

/** A slip page with its logo inlined is tens of kilobytes; this leaves room for a big logo. */
export const MAX_JOB_HTML = 2_000_000;

export const JOB_STATUSES = ["QUEUED", "PRINTING", "PRINTED", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function cloudPrintBusinessIds(env: string | undefined = process.env.CLOUD_PRINT_BUSINESS_IDS): string[] {
  return (env ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Not configured means no shop, so a missing setting never opens it to everyone. */
export function cloudPrintEnabled(businessId: string, env?: string): boolean {
  return cloudPrintBusinessIds(env).includes(businessId);
}

/** The jobs a station may take now: waiting ones, and ones a dead station left behind. */
export function claimableWhere(businessId: string, now: Date) {
  return {
    businessId,
    OR: [
      { status: "QUEUED" },
      { status: "PRINTING", claimedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } },
    ],
  };
}

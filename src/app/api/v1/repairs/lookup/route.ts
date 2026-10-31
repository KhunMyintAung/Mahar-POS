import { withAuth, json, ApiError } from "@/lib/api";
import { findRepairByCode } from "@/lib/repairLookup";
import { trackToken } from "@/lib/repairTrack";

/** The repair a scanned voucher stands for (its QR or its number), for the till's scan box. */
export const GET = withAuth("repair.view", async ({ req, user }) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const job = code ? await findRepairByCode(user, code) : null;
  if (!job) throw new ApiError(404, "No repair with that voucher");
  return json({ ...job, trackToken: trackToken(job.id) });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cloudPrintEnabled } from "@/lib/cloudPrint";

const patchSchema = z.object({
  status: z.enum(["PRINTED", "FAILED", "QUEUED"]),
  error: z.string().trim().max(300).optional(),
});

/** The station reports how a slip it took went, or puts one back in line to print again. */
export const PATCH = withAuth("settings.manage", async ({ req, user, params }) => {
  if (!cloudPrintEnabled(user.businessId)) throw new ApiError(404, "Not found");
  const body = await parseBody(req, patchSchema);
  const done = await prisma.printJob.updateMany({
    where: { id: params.id, businessId: user.businessId },
    data:
      body.status === "PRINTED" ? { status: "PRINTED", printedAt: new Date(), error: null }
      : body.status === "QUEUED" ? { status: "QUEUED", claimedAt: null, printedAt: null, error: null }
      : { status: "FAILED", error: body.error ?? "Print failed" },
  });
  if (done.count === 0) throw new ApiError(404, "Print job not found");
  return json({ id: params.id, status: body.status });
});

import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { PRIORITIES, updateRepairDetails } from "@/services/repairService";

/** Correct what was written down at intake: names, phone, device, problem, quote. */

// An empty string clears an optional field; a required one must stay filled.
const optional = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).optional();

const schema = z.object({
  customerName: optional(120),
  customerPhone: optional(40),
  deviceBrand: z.string().trim().min(1).max(60).optional(),
  deviceModel: z.string().trim().min(1).max(80).optional(),
  imei: optional(40),
  accessories: optional(300),
  problem: z.string().trim().min(1).max(500).optional(),
  intakeCondition: optional(500),
  priority: z.enum(PRIORITIES).optional(),
  estimatedCost: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  promisedAt: z.string().trim().optional(),
  notes: optional(500),
});

export const PATCH = withAuth("repair.update", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const job = await prisma.$transaction((tx) =>
    updateRepairDetails(tx, {
      businessId: user.businessId,
      userId: user.id,
      jobId: params.id,
      details: {
        ...body,
        estimatedCost: body.estimatedCost === undefined ? undefined : toMinor(body.estimatedCost),
        promisedAt: body.promisedAt === undefined ? undefined : body.promisedAt ? new Date(body.promisedAt) : null,
      },
    })
  );
  return json(job);
});

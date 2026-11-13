import { z } from "zod";
import { withAuth, json, parseBody, pagination, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createRepairJob, PRIORITIES, REPAIR_STATUSES, voucherNumberFormat } from "@/services/repairService";
import { BENCH_STATUSES, READY_STATUSES } from "@/lib/repairStatus";
import { trackToken } from "@/lib/repairTrack";
import { autoCorrectName } from "@/lib/autoCorrect";
import { isValidMonth, monthRangeUtc, todayBusinessDate } from "@/lib/dates";
import { notifyAuditFeed, repairNewNotice } from "@/lib/telegramNotify";
import { isDuplicateOp, offlineAt, offlineOpSchema, priorOp, recordOp } from "@/lib/offlineOp";

/** What the repair page needs beyond the row: the voucher's QR link and who took it in. */
async function withVoucherFields<T extends { id: string; createdById: string | null }>(businessId: string, jobs: T[]) {
  const ids = [...new Set(jobs.map((j) => j.createdById).filter(Boolean))] as string[];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids }, businessId }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return jobs.map((j) => ({
    ...j,
    trackToken: trackToken(j.id),
    receivedByName: j.createdById ? names.get(j.createdById) : undefined,
  }));
}

export const GET = withAuth("repair.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  // An exact IMEI / serial match: the history of one physical device.
  const imei = sp.get("imei")?.trim();

  const scope = { businessId: user.businessId, deletedAt: null, ...branchScope(user) };
  // Money owed on a job: its price is more than what was taken on it.
  const OWES = { status: { in: ["DONE", "DELIVERED"] }, finalCost: { gt: prisma.repairJob.fields.paidAmount } };
  // The summary cards count one month of intake, this month unless another is asked for.
  const monthParam = sp.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : todayBusinessDate().slice(0, 7);
  const where = {
    ...scope,
    // "WORKING" is every status still on the bench, the Working count on the page.
    // "UNPAID": priced and not fully paid, in the shop or already handed back: money owed.
    // A job with no price yet is not counted; it is only waiting for its price.
    // "READY": work is over and the device is waiting to be collected, repaired or not (the
    // Done count). "RETURNED_UNFIXED": could not be repaired and already handed back.
    ...(status === "WORKING" ? { status: { in: BENCH_STATUSES } }
      : status === "READY" ? { status: { in: READY_STATUSES } }
      : status === "UNPAID" ? OWES
      : status === "RETURNED_UNFIXED" ? { status: "DELIVERED", cannotRepair: true }
      : status ? { status } : {}),
    ...(imei ? { imei: { equals: imei, mode: "insensitive" as const } } : {}),
    // ?listMonth=1: the list too is the month's intake, matching the counts above it.
    ...(sp.get("listMonth") === "1" ? { receivedAt: monthRangeUtc(month) } : {}),
    ...(q
      ? {
          OR: [
            { jobNo: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerPhone: { contains: q, mode: "insensitive" as const } },
            { deviceBrand: { contains: q, mode: "insensitive" as const } },
            { deviceModel: { contains: q, mode: "insensitive" as const } },
            { imei: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [jobs, total, byStatus, unpaid] = await Promise.all([
    prisma.repairJob.findMany({ where, orderBy: { receivedAt: "desc" }, skip, take }),
    prisma.repairJob.count({ where }),
    prisma.repairJob.groupBy({
      by: ["status"],
      where: { ...scope, receivedAt: monthRangeUtc(month) },
      _count: { _all: true },
    }),
    prisma.repairJob.count({ where: { ...scope, receivedAt: monthRangeUtc(month), ...OWES } }),
  ]);

  const count = (statuses: string[]) =>
    byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
  const summary = {
    total: byStatus.reduce((n, s) => n + s._count._all, 0),
    inWorkflow: count(BENCH_STATUSES),
    // Each job in one count only, so the counts add up to the total.
    completed: count(["DONE"]),
    cannotRepair: count(["CANNOT_REPAIR"]),
    delivered: count(["DELIVERED"]),
    cancelled: count(["CANCELLED"]),
    unpaid,
  };

  return json({
    jobs: await withVoucherFields(user.businessId, jobs),
    total, page, pageSize,
    summary: { ...summary, month },
  });
});

const createSchema = z.object({
  branchId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  // Typos are mended as they are saved: "iphne 12promax" → "iPhone 12 Pro Max".
  deviceBrand: z.string().trim().min(1).max(60).transform(autoCorrectName),
  deviceModel: z.string().trim().min(1).max(80).transform(autoCorrectName),
  imei: z.string().trim().max(40).optional(),
  accessories: z.string().trim().max(300).optional(),
  problem: z.string().trim().min(1).max(500),
  intakeCondition: z.string().trim().max(500).optional(),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  estimatedCost: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  depositAmount: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  depositWalletId: z.string().optional(),
  technicianId: z.string().optional(),
  technicianName: z.string().trim().max(80).optional(),
  promisedAt: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  /** Taken in without the internet and sent now, with a number from the device's block. */
  offline: offlineOpSchema.extend({
    number: z.object({ blockId: z.string().min(1).max(64), n: z.number().int().positive() }).optional(),
  }).optional(),
});

/** The job an earlier send of the same offline intake made. */
async function sentBefore(businessId: string, refId: string | null) {
  const job = refId ? await prisma.repairJob.findFirst({ where: { id: refId, businessId } }) : null;
  if (!job) throw new ApiError(409, "This repair was already sent");
  const [withFields] = await withVoucherFields(businessId, [job]);
  return json(withFields);
}

export const POST = withAuth("repair.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);
  const offline = body.offline;
  const prior = await priorOp(user.businessId, offline);
  if (prior) return sentBefore(user.businessId, prior.refId);
  const receivedAt = offline ? offlineAt(offline) : undefined;

  // An owner has every branch rather than a list of them, so branchIds is empty for the
  // most common account there is — reading the first entry found nothing and refused the
  // job. The branch is looked up instead, scoped to what this user may reach.
  let branchId = body.branchId;
  if (branchId) {
    await assertBranchAccess(user, branchId);
  } else {
    const branch = await prisma.branch.findFirst({
      where: { businessId: user.businessId, active: true, ...branchScope(user) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!branch) throw new ApiError(422, "This business has no branch set up yet.");
    branchId = branch.id;
  }

  // A number from this user's own reserved block keeps the shop's sequence.
  let number: number | undefined;
  if (offline?.number) {
    const { blockId, n } = offline.number;
    const block = await prisma.repairNumberBlock.findFirst({ where: { id: blockId, businessId: user.businessId, userId: user.id } });
    if (block && n >= block.first && n <= block.last) number = n;
  }

  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
      if (number != null) {
        const jobNo = (await voucherNumberFormat(tx, user.businessId))(number);
        // Already used (sent from another device by mistake): it takes the next number instead.
        if (await tx.repairJob.findFirst({ where: { businessId: user.businessId, jobNo }, select: { id: true } })) number = undefined;
      }
      const made = await createRepairJob(tx, {
      businessId: user.businessId,
      branchId,
      userId: user.id,
      customerId: body.customerId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      deviceBrand: body.deviceBrand,
      deviceModel: body.deviceModel,
      imei: body.imei,
      accessories: body.accessories,
      problem: body.problem,
      intakeCondition: body.intakeCondition,
      priority: body.priority,
      estimatedCost: toMinor(body.estimatedCost),
      depositAmount: toMinor(body.depositAmount),
      depositWalletId: body.depositWalletId,
      technicianId: body.technicianId,
      technicianName: body.technicianName || undefined,
      promisedAt: body.promisedAt ? new Date(body.promisedAt) : undefined,
      notes: body.notes,
      number,
      receivedAt,
      });
      await recordOp(tx, user.businessId, "repair.create", offline, made.id);
      return made;
    });
  } catch (error) {
    if (offline && isDuplicateOp(error)) {
      const again = await priorOp(user.businessId, offline);
      if (again) return sentBefore(user.businessId, again.refId);
    }
    throw error;
  }

  notifyAuditFeed(user.businessId, repairNewNotice({ ...job, createdByName: user.name }), undefined, user.id);

  const [withFields] = await withVoucherFields(user.businessId, [job]);
  return json(withFields, { status: 201 });
});

export const REPAIR_STATUS_VALUES = REPAIR_STATUSES;

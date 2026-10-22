import { z } from "zod";
import { withAuth, json, parseBody, pagination, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createRepairJob, PRIORITIES, REPAIR_STATUSES } from "@/services/repairService";
import { BENCH_STATUSES } from "@/lib/repairStatus";
import { trackToken } from "@/lib/repairTrack";
import { autoCorrectName } from "@/lib/autoCorrect";
import { isValidMonth, monthRangeUtc, todayBusinessDate } from "@/lib/dates";
import { notifyAuditFeed, repairNewNotice } from "@/lib/telegramNotify";

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
  // The summary cards count one month of intake, this month unless another is asked for.
  const monthParam = sp.get("month");
  const month = monthParam && isValidMonth(monthParam) ? monthParam : todayBusinessDate().slice(0, 7);
  const where = {
    ...scope,
    ...(status ? { status } : {}),
    ...(imei ? { imei: { equals: imei, mode: "insensitive" as const } } : {}),
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

  const [jobs, total, byStatus] = await Promise.all([
    prisma.repairJob.findMany({ where, orderBy: { receivedAt: "desc" }, skip, take }),
    prisma.repairJob.count({ where }),
    prisma.repairJob.groupBy({
      by: ["status"],
      where: { ...scope, receivedAt: monthRangeUtc(month) },
      _count: { _all: true },
    }),
  ]);

  const count = (statuses: string[]) =>
    byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
  const summary = {
    total: byStatus.reduce((n, s) => n + s._count._all, 0),
    inWorkflow: count(BENCH_STATUSES),
    completed: count(["DONE", "CANNOT_REPAIR"]),
    delivered: count(["DELIVERED"]),
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
  promisedAt: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const POST = withAuth("repair.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);

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

  const job = await prisma.$transaction((tx) =>
    createRepairJob(tx, {
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
      promisedAt: body.promisedAt ? new Date(body.promisedAt) : undefined,
      notes: body.notes,
    })
  );

  notifyAuditFeed(user.businessId, repairNewNotice({ ...job, createdByName: user.name }));

  const [withFields] = await withVoucherFields(user.businessId, [job]);
  return json(withFields, { status: 201 });
});

export const REPAIR_STATUS_VALUES = REPAIR_STATUSES;

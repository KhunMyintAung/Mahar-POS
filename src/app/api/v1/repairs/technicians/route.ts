import { z } from "zod";
import bcrypt from "bcryptjs";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isValidMonth, todayBusinessDate } from "@/lib/dates";
import { toMinor } from "@/lib/money";
import { SERVICE_TECH_PERMS } from "@/lib/permissions";
import { COMMISSION_MODES, technicianPerformance } from "@/services/technicianService";

/** How each technician did in a month (?month=YYYY-MM, this month by default), with what
 *  each earned, and the Service Tech users a repair can be given to (see
 *  technicianPerformance). A technician sees only their own row; how others are paid is not
 *  theirs to see. Only someone who manages users sees the commission rules. */
export const GET = withAuth("repair.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const month = isValidMonth(sp.get("month") ?? "") ? sp.get("month")! : todayBusinessDate().slice(0, 7);
  const { technicians, serviceTechs } = await technicianPerformance(user.businessId, month);

  const ownOnly = user.roleName === "Service Tech";
  const manager = user.permissions.includes("users.manage");
  const rows = (ownOnly ? technicians.filter((t) => t.userId === user.id) : technicians)
    .map((t) => (manager ? t : { ...t, rule: null }));

  return json({ month, technicians: rows, serviceTechs, ownOnly, canSetCommission: manager });
});

const commissionSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(COMMISSION_MODES),
  percent: z.string().regex(/^\d+(\.\d+)?$/, "Enter a percent").refine((p) => Number(p) <= 100, "A percent cannot be over 100").optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter an amount").optional(),
});

const newTechSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  username: z.string().trim().min(3).regex(/^[a-z0-9_.-]+$/i, "Letters, numbers, dots, dashes only"),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  branchIds: z.array(z.string()).min(1, "Choose a branch"),
  mode: z.enum(COMMISSION_MODES).default("NONE"),
  percent: z.string().regex(/^\d+(\.\d+)?$/, "Enter a percent").refine((p) => Number(p) <= 100, "A percent cannot be over 100").optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter an amount").optional(),
});

/** Add a technician from the Technicians page: a login with the Service Tech role, in the
 *  branches chosen, and what they earn per finished repair. A shop made before that role
 *  existed gets it here. */
export const POST = withAuth("users.manage", async ({ req, user }) => {
  const body = await parseBody(req, newTechSchema);
  const username = body.username.toLowerCase();
  if (await prisma.user.findUnique({ where: { username } })) throw new ApiError(422, "Username is already taken");
  const branchIds = [...new Set(body.branchIds)];
  const branchCount = await prisma.branch.count({ where: { id: { in: branchIds }, businessId: user.businessId, active: true } });
  if (branchCount !== branchIds.length) throw new ApiError(404, "Branch not found");
  const percent = body.mode === "PERCENT" ? body.percent ?? "0" : "0";
  const amount = body.mode === "AMOUNT" ? toMinor(body.amount ?? "0") : 0n;
  if (body.mode === "PERCENT" && Number(percent) <= 0) throw new ApiError(422, "Enter a percent");
  if (body.mode === "AMOUNT" && amount <= 0n) throw new ApiError(422, "Enter an amount");
  const passwordHash = await bcrypt.hash(body.password, 10);

  const created = await prisma.$transaction(async (tx) => {
    const role =
      (await tx.role.findFirst({ where: { businessId: user.businessId, name: "Service Tech" } })) ??
      (await tx.role.create({
        data: { businessId: user.businessId, name: "Service Tech", description: "Repairs and their parts, no money", permissions: JSON.stringify(SERVICE_TECH_PERMS), isSystem: true },
      }));
    const u = await tx.user.create({
      data: {
        businessId: user.businessId,
        name: body.name,
        username,
        phone: body.phone || undefined,
        passwordHash,
        roleId: role.id,
        repairCommissionMode: body.mode,
        repairCommissionPercent: percent,
        repairCommissionAmount: amount,
        branches: { create: branchIds.map((branchId) => ({ branchId })) },
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "users", resourceType: "User", resourceId: u.id,
      after: { name: u.name, username: u.username, role: role.name, commission: { mode: body.mode, percent, amount: amount.toString() } },
    });
    return u;
  });
  return json({ id: created.id, name: created.name, username: created.username }, { status: 201 });
});

/** Set what a Service Tech earns per finished repair: a percent of what it made, or a fixed sum. */
export const PATCH = withAuth("users.manage", async ({ req, user }) => {
  const body = await parseBody(req, commissionSchema);
  const tech = await prisma.user.findFirst({
    where: { id: body.userId, businessId: user.businessId, deletedAt: null, role: { name: "Service Tech" } },
    select: { id: true, repairCommissionMode: true, repairCommissionPercent: true, repairCommissionAmount: true },
  });
  if (!tech) throw new ApiError(404, "Technician not found");

  const data = {
    repairCommissionMode: body.mode,
    repairCommissionPercent: body.mode === "PERCENT" ? body.percent ?? "0" : tech.repairCommissionPercent,
    repairCommissionAmount: body.mode === "AMOUNT" ? toMinor(body.amount ?? "0") : tech.repairCommissionAmount,
  };
  if (body.mode === "PERCENT" && Number(data.repairCommissionPercent) <= 0) throw new ApiError(422, "Enter a percent");
  if (body.mode === "AMOUNT" && data.repairCommissionAmount <= 0n) throw new ApiError(422, "Enter an amount");

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: tech.id }, data, select: { id: true, repairCommissionMode: true, repairCommissionPercent: true, repairCommissionAmount: true } });
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      action: "UPDATE",
      module: "repair",
      resourceType: "User",
      resourceId: tech.id,
      before: { mode: tech.repairCommissionMode, percent: tech.repairCommissionPercent, amount: tech.repairCommissionAmount.toString() },
      after: { mode: u.repairCommissionMode, percent: u.repairCommissionPercent, amount: u.repairCommissionAmount.toString() },
    });
    return u;
  });
  return json(updated);
});

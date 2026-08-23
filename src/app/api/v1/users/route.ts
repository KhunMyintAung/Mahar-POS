import { z } from "zod";
import bcrypt from "bcryptjs";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const GET = withAuth("users.manage", async ({ user }) => {
  const users = await prisma.user.findMany({
    where: { businessId: user.businessId, deletedAt: null },
    select: {
      id: true, name: true, username: true, email: true, phone: true, active: true,
      allBranches: true, commissionRate: true, createdAt: true,
      role: { select: { id: true, name: true } },
      branches: { select: { branch: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return json(users);
});

const schema = z.object({
  name: z.string().min(1),
  username: z.string().min(3).regex(/^[a-z0-9_.-]+$/i, "Letters, numbers, dots, dashes only"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.string().min(1),
  allBranches: z.boolean().default(false),
  branchIds: z.array(z.string()).default([]),
  commissionRate: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
});

export const POST = withAuth("users.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const role = await prisma.role.findUnique({ where: { id: body.roleId } });
  if (!role || role.businessId !== user.businessId) throw new ApiError(404, "Role not found");

  const existing = await prisma.user.findUnique({ where: { username: body.username.toLowerCase() } });
  if (existing) throw new ApiError(422, "Username is already taken");
  if (!body.allBranches) {
    const uniqueBranchIds = [...new Set(body.branchIds)];
    const branchCount = await prisma.branch.count({
      where: {
        id: { in: uniqueBranchIds },
        businessId: user.businessId,
        active: true,
      },
    });
    if (branchCount !== uniqueBranchIds.length) throw new ApiError(404, "Branch not found");
  }

  const created = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        businessId: user.businessId,
        name: body.name,
        username: body.username.toLowerCase(),
        email: body.email?.toLowerCase(),
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
        roleId: body.roleId,
        allBranches: body.allBranches,
        commissionRate: body.commissionRate,
      },
    });
    if (!body.allBranches) {
      for (const branchId of body.branchIds) {
        await tx.userBranch.create({ data: { userId: u.id, branchId } });
      }
    }
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "users", resourceType: "User", resourceId: u.id,
      after: { name: u.name, username: u.username, role: role.name },
    });
    return u;
  });
  return json({ id: created.id, name: created.name, username: created.username }, { status: 201 });
});

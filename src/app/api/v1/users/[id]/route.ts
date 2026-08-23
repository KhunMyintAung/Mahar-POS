import { z } from "zod";
import bcrypt from "bcryptjs";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { destroyAllSessions } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
  roleId: z.string().optional(),
  allBranches: z.boolean().optional(),
  branchIds: z.array(z.string()).optional(),
  commissionRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  active: z.boolean().optional(),
});

export const PATCH = withAuth("users.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || target.businessId !== user.businessId || target.deletedAt)
    throw new ApiError(404, "User not found");

  const updated = await prisma.$transaction(async (tx) => {
    if (body.roleId) {
      const role = await tx.role.findFirst({
        where: { id: body.roleId, businessId: user.businessId },
        select: { id: true },
      });
      if (!role) throw new ApiError(404, "Role not found");
    }
    if (body.branchIds) {
      const uniqueBranchIds = [...new Set(body.branchIds)];
      const branchCount = await tx.branch.count({
        where: {
          id: { in: uniqueBranchIds },
          businessId: user.businessId,
          active: true,
        },
      });
      if (branchCount !== uniqueBranchIds.length) throw new ApiError(404, "Branch not found");
    }
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.roleId !== undefined) data.roleId = body.roleId;
    if (body.allBranches !== undefined) data.allBranches = body.allBranches;
    if (body.commissionRate !== undefined) data.commissionRate = body.commissionRate;
    if (body.active !== undefined) data.active = body.active;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

    const u = await tx.user.update({ where: { id: target.id }, data });

    if (body.branchIds) {
      await tx.userBranch.deleteMany({ where: { userId: target.id } });
      for (const branchId of body.branchIds) {
        await tx.userBranch.create({ data: { userId: target.id, branchId } });
      }
    }
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: body.roleId ? "PERMISSION_CHANGE" : "UPDATE",
      module: "users", resourceType: "User", resourceId: u.id,
      after: { ...body, password: body.password ? "(changed)" : undefined },
    });
    return u;
  });

  // Force re-login when access-relevant fields changed
  if (body.roleId || body.active === false || body.password) {
    await destroyAllSessions(target.id);
  }
  return json({ id: updated.id, name: updated.name });
});

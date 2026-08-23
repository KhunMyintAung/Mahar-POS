import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export const GET = withAuth("users.manage", async ({ user }) => {
  const roles = await prisma.role.findMany({
    where: { businessId: user.businessId },
    include: { _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  });
  return json({
    roles: roles.map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })),
    allPermissions: ALL_PERMISSIONS,
  });
});

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1),
});

export const POST = withAuth("users.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const invalid = body.permissions.filter((p) => !(ALL_PERMISSIONS as readonly string[]).includes(p));
  if (invalid.length) throw new ApiError(422, `Unknown permissions: ${invalid.join(", ")}`);

  const role = await prisma.$transaction(async (tx) => {
    const r = await tx.role.create({
      data: {
        businessId: user.businessId,
        name: body.name,
        description: body.description,
        permissions: JSON.stringify(body.permissions),
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "PERMISSION_CHANGE", module: "users", resourceType: "Role", resourceId: r.id,
      after: { name: body.name, permissions: body.permissions },
    });
    return r;
  });
  return json(role, { status: 201 });
});

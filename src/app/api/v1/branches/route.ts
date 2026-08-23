import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const GET = withAuth(null, async ({ user }) => {
  const branches = await prisma.branch.findMany({
    where: {
      businessId: user.businessId,
      active: true,
      ...(user.allBranches ? {} : { id: { in: user.branchIds } }),
    },
    orderBy: { name: "asc" },
  });
  return json(branches);
});

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const branch = await prisma.$transaction(async (tx) => {
    const b = await tx.branch.create({
      data: {
        businessId: user.businessId,
        name: body.name,
        code: body.code.toUpperCase(),
        address: body.address,
        phone: body.phone,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id,
      action: "CREATE", module: "settings", resourceType: "Branch", resourceId: b.id,
      after: { name: b.name, code: b.code },
    });
    return b;
  });
  return json(branch, { status: 201 });
});

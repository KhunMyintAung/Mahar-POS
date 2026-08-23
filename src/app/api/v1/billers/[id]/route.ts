import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { BILLER_TYPES } from "@/services/billerService";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  type: z.enum(BILLER_TYPES).optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(300).optional(),
});

export const PATCH = withAuth("biller.manage", async ({ req, user, params }) => {
  const id = params.id;
  const body = await parseBody(req, patchSchema);

  const biller = await prisma.biller.findFirst({
    where: { id, businessId: user.businessId, deletedAt: null },
  });
  if (!biller) throw new ApiError(404, "Biller not found");

  if (body.name && body.name !== biller.name) {
    const clash = await prisma.biller.findFirst({
      where: { businessId: user.businessId, name: body.name, deletedAt: null, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw new ApiError(409, `There is already a biller called ${body.name}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.biller.update({
      where: { id },
      data: {
        name: body.name ?? biller.name,
        type: body.type ?? biller.type,
        active: body.active ?? biller.active,
        notes: body.notes ?? biller.notes,
      },
    });
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      branchId: biller.branchId ?? undefined,
      action: "UPDATE",
      module: "biller",
      resourceType: "Biller",
      resourceId: id,
      before: { name: biller.name, type: biller.type, active: biller.active },
      after: { name: next.name, type: next.type, active: next.active },
    });
    return next;
  });

  return json(updated);
});

export const DELETE = withAuth("biller.manage", async ({ user, params }) => {
  const id = params.id;
  const biller = await prisma.biller.findFirst({
    where: { id, businessId: user.businessId, deletedAt: null },
  });
  if (!biller) throw new ApiError(404, "Biller not found");

  // A float that still holds credit is real money with the operator. Switching it off is
  // the reversible thing to do; removing it would hide a balance the shop still owns.
  if (biller.currentBalance !== 0n) {
    throw new ApiError(422, `${biller.name} still holds a balance. Settle it to zero first, or switch it off instead.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.biller.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit(tx, {
      businessId: user.businessId,
      userId: user.id,
      branchId: biller.branchId ?? undefined,
      action: "DELETE",
      module: "biller",
      resourceType: "Biller",
      resourceId: id,
      before: { name: biller.name, type: biller.type },
    });
  });

  return json({ deleted: true });
});

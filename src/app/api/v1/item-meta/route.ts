import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Categories and units for the item catalog, managed together.

export const GET = withAuth("item.view", async ({ user }) => {
  const [categories, units] = await Promise.all([
    prisma.itemCategory.findMany({ where: { businessId: user.businessId, active: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { businessId: user.businessId, active: true }, orderBy: { name: "asc" } }),
  ]);
  return json({ categories, units });
});

const schema = z.object({
  kind: z.enum(["category", "unit"]),
  name: z.string().min(1),
  parentId: z.string().optional(), // categories only
});

export const POST = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  if (body.kind === "category") {
    if (body.parentId) {
      const parent = await prisma.itemCategory.findFirst({
        where: { id: body.parentId, businessId: user.businessId, active: true },
        select: { id: true },
      });
      if (!parent) throw new ApiError(404, "Parent category not found");
    }
    const cat = await prisma.itemCategory.create({
      data: { businessId: user.businessId, name: body.name, parentId: body.parentId },
    }).catch(() => { throw new ApiError(422, "Category already exists"); });
    return json(cat, { status: 201 });
  }
  const unit = await prisma.unit.create({
    data: { businessId: user.businessId, name: body.name },
  }).catch(() => { throw new ApiError(422, "Unit already exists"); });
  return json(unit, { status: 201 });
});

import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Categories and units for the item catalog, managed together.

export const GET = withAuth("item.view", async ({ user }) => {
  // Each with how many items use it, so the shop sees what a delete would move.
  const count = { _count: { select: { items: { where: { deletedAt: null } } } } } as const;
  const [categories, units] = await Promise.all([
    prisma.itemCategory.findMany({ where: { businessId: user.businessId, active: true }, orderBy: { name: "asc" }, include: count }),
    prisma.unit.findMany({ where: { businessId: user.businessId, active: true }, orderBy: { name: "asc" }, include: count }),
  ]);
  const flat = <T extends { _count: { items: number } }>({ _count, ...r }: T) => ({ ...r, itemCount: _count.items });
  return json({ categories: categories.map(flat), units: units.map(flat) });
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
    // One deleted before comes back rather than clashing with its old name.
    const old = await prisma.itemCategory.findFirst({
      where: { businessId: user.businessId, name: body.name, parentId: body.parentId ?? null, active: false },
      select: { id: true },
    });
    if (old) return json(await prisma.itemCategory.update({ where: { id: old.id }, data: { active: true } }), { status: 201 });
    const cat = await prisma.itemCategory.create({
      data: { businessId: user.businessId, name: body.name, parentId: body.parentId },
    }).catch(() => { throw new ApiError(422, "Category already exists"); });
    return json(cat, { status: 201 });
  }
  const oldUnit = await prisma.unit.findFirst({
    where: { businessId: user.businessId, name: body.name, active: false },
    select: { id: true },
  });
  if (oldUnit) return json(await prisma.unit.update({ where: { id: oldUnit.id }, data: { active: true } }), { status: 201 });
  const unit = await prisma.unit.create({
    data: { businessId: user.businessId, name: body.name },
  }).catch(() => { throw new ApiError(422, "Unit already exists"); });
  return json(unit, { status: 201 });
});

const removeSchema = z.object({
  kind: z.enum(["category", "unit"]),
  id: z.string().min(1),
  moveTo: z.string().optional(), // the items go here; none: they are left without one
});

/** Takes a category or unit off the list (kept, not erased, so old sales still read).
 *  Its items move to `moveTo`, which also joins two that are the same thing spelt twice.
 *  A main category takes its sub-categories with it. */
export const DELETE = withAuth("item.manage", async ({ req, user }) => {
  const body = await parseBody(req, removeSchema);
  const businessId = user.businessId;
  if (body.moveTo === body.id) throw new ApiError(422, "Pick another one to move the items to");
  const moved = await prisma.$transaction(async (tx) => {
    if (body.kind === "unit") {
      const unit = await tx.unit.findFirst({ where: { id: body.id, businessId, active: true }, select: { id: true } });
      if (!unit) throw new ApiError(404, "Unit not found");
      if (body.moveTo && !(await tx.unit.findFirst({ where: { id: body.moveTo, businessId, active: true }, select: { id: true } })))
        throw new ApiError(404, "Unit not found");
      const r = await tx.item.updateMany({ where: { businessId, unitId: unit.id }, data: { unitId: body.moveTo ?? null } });
      await tx.unit.update({ where: { id: unit.id }, data: { active: false } });
      return r.count;
    }
    const cat = await tx.itemCategory.findFirst({ where: { id: body.id, businessId, active: true }, select: { id: true } });
    if (!cat) throw new ApiError(404, "Category not found");
    const subs = await tx.itemCategory.findMany({ where: { businessId, parentId: cat.id, active: true }, select: { id: true } });
    const ids = [cat.id, ...subs.map((c) => c.id)];
    if (body.moveTo) {
      const to = await tx.itemCategory.findFirst({ where: { id: body.moveTo, businessId, active: true }, select: { id: true } });
      if (!to || ids.includes(to.id)) throw new ApiError(422, "Pick another one to move the items to");
    }
    const r = await tx.item.updateMany({ where: { businessId, categoryId: { in: ids } }, data: { categoryId: body.moveTo ?? null } });
    await tx.itemCategory.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    return r.count;
  });
  return json({ moved });
});

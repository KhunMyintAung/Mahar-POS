import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureStandardCategories, hiddenStandardKeys } from "@/lib/incomeCategories";
import { loadModuleAccess } from "@/lib/moduleAccess";

export const GET = withAuth("income_expense.view", async ({ req, user }) => {
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  // Every shop has the eight standard daily categories; one opened before they existed gets
  // them the first time the list is read.
  await prisma.$transaction((tx) => ensureStandardCategories(tx, user.businessId));
  const hidden: (string | null)[] = hiddenStandardKeys((await loadModuleAccess(user.businessId)).features);
  const categories = (await prisma.category.findMany({
    where: { businessId: user.businessId, active: true, ...(type ? { type } : {}) },
    orderBy: { name: "asc" },
  })).filter((c) => !hidden.includes(c.systemKey));
  // The standard ones first, in their set order, then the shop's own A to Z.
  const order = ["DAILY_SERVICE", "DAILY_SALE", "DAILY_BILL", "DAILY_GENERAL"];
  categories.sort((a, b) => {
    const ia = a.systemKey ? order.indexOf(a.systemKey) : 99;
    const ib = b.systemKey ? order.indexOf(b.systemKey) : 99;
    return ia - ib || a.name.localeCompare(b.name);
  });
  return json(categories);
});

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  name: z.string().trim().min(1).max(80),
});

export const POST = withAuth(null, async ({ req, user }) => {
  if (!can(user, "income_expense.create") && !can(user, "settings.manage")) {
    throw new ApiError(403, "You do not have permission to add categories");
  }
  const body = await parseBody(req, schema);
  const category = await prisma.category.upsert({
    where: { businessId_type_name: { businessId: user.businessId, type: body.type, name: body.name } },
    create: { businessId: user.businessId, type: body.type, name: body.name },
    update: { active: true },
  });
  return json(category, { status: 201 });
});

/** Remove a category from the pickers.
 *
 *  A category that has never been used is deleted outright, which frees its name to be
 *  created again. One that has been used is deactivated instead: past records point at it
 *  by id, and removing the row would leave those pointing at nothing. Either way it stops
 *  appearing when someone records income or expense, which is what "delete" means here.
 *
 *  History is unaffected regardless — each record carries the category name it was filed
 *  under, so what it was called then survives whatever happens to the category now.
 */
export const DELETE = withAuth(null, async ({ req, user }) => {
  if (!can(user, "income_expense.create") && !can(user, "settings.manage")) {
    throw new ApiError(403, "You do not have permission to remove categories");
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(422, "Which category?");

  const category = await prisma.category.findFirst({
    where: { id, businessId: user.businessId },
  });
  if (!category) throw new ApiError(404, "Category not found");
  if (category.systemKey) throw new ApiError(422, `"${category.name}" is a standard category. It can be renamed but not deleted.`);

  const used = await prisma.incomeExpense.count({
    where: { businessId: user.businessId, categoryId: category.id },
  });

  if (used > 0) {
    await prisma.category.update({ where: { id: category.id }, data: { active: false } });
    return json({ id: category.id, removed: false, keptForRecords: used });
  }

  await prisma.category.delete({ where: { id: category.id } });
  return json({ id: category.id, removed: true, keptForRecords: 0 });
});

const renameSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) });

/** Rename a category, standard or not. Entries filed under the old name move to the new
 *  one, so reports keep them together. */
export const PATCH = withAuth(null, async ({ req, user }) => {
  if (!can(user, "income_expense.create") && !can(user, "settings.manage")) {
    throw new ApiError(403, "You do not have permission to rename categories");
  }
  const body = await parseBody(req, renameSchema);
  const category = await prisma.category.findFirst({ where: { id: body.id, businessId: user.businessId } });
  if (!category) throw new ApiError(404, "Category not found");
  if (category.name === body.name) return json(category);
  const clash = await prisma.category.findFirst({
    where: { businessId: user.businessId, type: category.type, name: { equals: body.name, mode: "insensitive" }, id: { not: category.id } },
    select: { id: true },
  });
  if (clash) throw new ApiError(422, `There is already a category called "${body.name}"`);

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.category.update({ where: { id: category.id }, data: { name: body.name } });
    await tx.incomeExpense.updateMany({
      where: { businessId: user.businessId, type: category.type, categoryName: category.name },
      data: { categoryName: body.name },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, action: "UPDATE", module: "income_expense",
      resourceType: "Category", resourceId: c.id, before: { name: category.name }, after: { name: c.name },
    });
    return c;
  });
  return json(updated);
});

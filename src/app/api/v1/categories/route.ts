import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";

export const GET = withAuth("income_expense.view", async ({ req, user }) => {
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  const categories = await prisma.category.findMany({
    where: { businessId: user.businessId, active: true, ...(type ? { type } : {}) },
    orderBy: { name: "asc" },
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

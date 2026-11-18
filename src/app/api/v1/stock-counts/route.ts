import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { canSeeCost } from "@/lib/permissions";
import { startStockCount } from "@/services/stockCountService";

// GET: the latest stock counts, open ones first, each with how far it has got and (once
// finished) how much was short or over.
export const GET = withAuth("stock.view", async ({ user }) => {
  const counts = await prisma.stockCount.findMany({
    where: { businessId: user.businessId, ...branchScope(user) },
    include: { lines: { select: { countedQty: true, adjustment: true, unitCost: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const branchIds = [...new Set(counts.map((c) => c.branchId))];
  const userIds = [...new Set(counts.map((c) => c.createdById))];
  const [branches, users] = await Promise.all([
    prisma.branch.findMany({ where: { businessId: user.businessId, id: { in: branchIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { businessId: user.businessId, id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const seeCost = canSeeCost(user.permissions);
  const rows = counts.map((c) => {
    let short = 0, over = 0, shortValue = 0n, overValue = 0n;
    for (const l of c.lines) {
      const d = l.adjustment ?? 0;
      if (d < 0) { short -= d; shortValue += l.unitCost * BigInt(-d); }
      if (d > 0) { over += d; overValue += l.unitCost * BigInt(d); }
    }
    return {
      id: c.id, txnNo: c.txnNo, status: c.status, branchId: c.branchId, branch: branchName.get(c.branchId) ?? "",
      categoryName: c.categoryName, notes: c.notes, createdAt: c.createdAt, completedAt: c.completedAt,
      createdBy: userName.get(c.createdById) ?? "",
      items: c.lines.length, counted: c.lines.filter((l) => l.countedQty !== null).length,
      short, over, shortValue: seeCost ? shortValue : 0n, overValue: seeCost ? overValue : 0n,
    };
  });
  rows.sort((a, b) => Number(b.status === "OPEN") - Number(a.status === "OPEN"));
  return json(rows);
});

const schema = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  notes: z.string().trim().max(300).optional(),
});

// POST: start a count: every item the books hold for the branch (or one category).
export const POST = withAuth("stock.adjust", async ({ req, user }) => {
  if (!user.permissions.includes("item.manage")) throw new ApiError(403, "You cannot start a stock count");
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.branchId);
  const result = await prisma.$transaction((tx) =>
    startStockCount(tx, { businessId: user.businessId, userId: user.id, branchId: body.branchId, categoryId: body.categoryId, notes: body.notes }),
    { timeout: 30_000 }
  );
  return json(result, { status: 201 });
});

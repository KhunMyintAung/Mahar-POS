import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertBranchAccess } from "@/lib/tenant";
import { canSeeCost } from "@/lib/permissions";
import { isValidBusinessDate, isValidMonth, todayBusinessDate } from "@/lib/dates";
import { createStockTransfer } from "@/services/stockTransferService";

// GET ?month=YYYY-MM: the stock transfers of a month (this month when not given), newest
// first, each with its lines. Staff of one branch see the transfers that left or reached it.
export const GET = withAuth("stock.view", async ({ req, user }) => {
  const month = req.nextUrl.searchParams.get("month") ?? todayBusinessDate().slice(0, 7);
  if (!isValidMonth(month)) throw new ApiError(422, "Choose a month");
  const transfers = await prisma.stockTransfer.findMany({
    where: {
      businessId: user.businessId,
      date: { gte: `${month}-01`, lte: `${month}-31` },
      ...(user.allBranches ? {} : { OR: [{ fromBranchId: { in: user.branchIds } }, { toBranchId: { in: user.branchIds } }] }),
    },
    include: { lines: { include: { item: { select: { name: true, sku: true } } } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const branchIds = [...new Set(transfers.flatMap((t) => [t.fromBranchId, t.toBranchId]))];
  const userIds = [...new Set(transfers.map((t) => t.createdById))];
  // Every branch, the switched-off ones too for old vouchers; a branch can send to any open one.
  const [branches, users] = await Promise.all([
    prisma.branch.findMany({ where: { businessId: user.businessId, OR: [{ id: { in: branchIds } }, { active: true }] }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { businessId: user.businessId, id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const seeCost = canSeeCost(user.permissions);
  return json({
    branches: branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name })),
    transfers: transfers.map((t) => ({
    id: t.id, txnNo: t.txnNo, date: t.date, status: t.status, notes: t.notes, createdAt: t.createdAt,
    cancelReason: t.cancelReason,
    fromBranchId: t.fromBranchId, toBranchId: t.toBranchId,
    fromBranch: branchName.get(t.fromBranchId) ?? "", toBranch: branchName.get(t.toBranchId) ?? "",
    createdBy: userName.get(t.createdById) ?? "",
    lines: t.lines.map((l) => ({
      itemId: l.itemId, name: l.item.name, sku: l.item.sku, quantity: l.quantity,
      unitCost: seeCost ? l.unitCost : 0n, imeis: l.imeis ? l.imeis.split(",") : [],
    })),
  })),
  });
});

const schema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  date: z.string().optional(),
  notes: z.string().trim().max(300).optional(),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().positive("Quantity must be above 0"),
    imeis: z.array(z.string().trim().max(40)).max(500).optional(),
  })).min(1, "Add at least one item").max(200),
});

// POST: send stock from one branch to another. Needs a hand on the sending branch.
export const POST = withAuth("stock.adjust", async ({ req, user }) => {
  if (!user.permissions.includes("item.manage")) throw new ApiError(403, "You cannot move stock between branches");
  const body = await parseBody(req, schema);
  await assertBranchAccess(user, body.fromBranchId);
  const today = todayBusinessDate();
  const date = body.date && isValidBusinessDate(body.date) ? body.date : today;
  if (date > today) throw new ApiError(422, "The date cannot be in the future");
  const result = await prisma.$transaction((tx) =>
    createStockTransfer(tx, {
      businessId: user.businessId, userId: user.id, fromBranchId: body.fromBranchId, toBranchId: body.toBranchId,
      date, notes: body.notes, lines: body.lines,
    })
  );
  return json(result, { status: 201 });
});

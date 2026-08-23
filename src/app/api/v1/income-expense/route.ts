import { z } from "zod";
import { withAuth, json, parseBody, ApiError, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope, canAccessBranch, can } from "@/lib/auth";
import { toMinor } from "@/lib/money";
import { todayBusinessDate, isValidBusinessDate } from "@/lib/dates";
import { notifyAuditFeed, incomeExpenseNotice } from "@/lib/telegramNotify";
import { createIncomeExpenseEntry } from "@/services/incomeExpenseService";

export const GET = withAuth(null, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const requestedType = sp.get("type");
  const canRead =
    can(user, "income_expense.view") ||
    (requestedType === "WITHDRAW" && can(user, "wallet.withdraw"));
  if (!canRead) throw new ApiError(403, "You do not have permission to view these records");

  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    deletedAt: null,
    status: "COMPLETED",
    ...branchScope(user),
    ...(requestedType ? { type: requestedType } : {}),
    ...(sp.get("date") ? { date: sp.get("date")! } : {}),
  };
  const [items, total, incomeAgg, expenseAgg, withdrawAgg, withdrawGroups] = await Promise.all([
    prisma.incomeExpense.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.incomeExpense.count({ where }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "INCOME", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "EXPENSE", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.incomeExpense.aggregate({ where: { ...where, type: "WITHDRAW", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.incomeExpense.groupBy({
      by: ["currency"],
      where: { ...where, type: "WITHDRAW", status: "COMPLETED" },
      _sum: { amount: true },
      orderBy: { currency: "asc" },
    }),
  ]);
  return json({
    items, total, page, pageSize,
    totals: {
      income: incomeAgg._sum.amount ?? 0n,
      expense: expenseAgg._sum.amount ?? 0n,
      withdraw: withdrawAgg._sum.amount ?? 0n,
      withdrawByCurrency: withdrawGroups.map((group) => ({
        currency: group.currency,
        amount: group._sum.amount ?? 0n,
      })),
    },
  });
});

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAW"]),
  branchId: z.string().min(1),
  categoryName: z.string().optional(),
  amount: z.string().min(1),
  walletId: z.string().min(1),
  date: z.string().refine(isValidBusinessDate).default(todayBusinessDate),
  reference: z.string().optional(),
  description: z.string().optional(),
});

export const POST = withAuth(null, async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const requiredPerm = body.type === "WITHDRAW" ? "wallet.withdraw" : "income_expense.create";
  if (!can(user, requiredPerm)) {
    throw new ApiError(403, "You do not have permission to perform this action");
  }
  if (!canAccessBranch(user, body.branchId)) throw new ApiError(403, "No access to this branch");
  const amount = toMinor(body.amount);

  const item = await prisma.$transaction((tx) =>
    createIncomeExpenseEntry(tx, {
      businessId: user.businessId,
      branchId: body.branchId,
      userId: user.id,
      type: body.type,
      categoryName: body.categoryName,
      amount,
      walletId: body.walletId,
      date: body.date,
      reference: body.reference,
      description: body.description,
    })
  );
  notifyAuditFeed(
    user.businessId,
    incomeExpenseNotice({
      txnNo: item.txnNo,
      type: item.type,
      categoryName: item.categoryName ?? "Withdrawal",
      amount: item.amount,
      currency: item.currency,
      createdByName: user.name,
      description: item.description,
    })
  );
  return json(item, { status: 201 });
});

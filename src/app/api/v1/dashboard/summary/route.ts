import { withAuth, json } from "@/lib/api";
import { canSeeCost } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { computeDayExpense, computeDayIncome, computeDaySummary } from "@/services/summaryService";
import { todayBusinessDate } from "@/lib/dates";
import { EXPIRY_WARN_DAYS } from "@/lib/expiry";
import { loadRepairFlow, paidTotals } from "@/services/repairProfitService";
import { loadModuleAccess } from "@/lib/moduleAccess";

export const GET = withAuth("dashboard.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") ?? todayBusinessDate();
  const branchId = sp.get("branchId");

  const branchIds = branchId
    ? [branchId]
    : user.allBranches
      ? undefined
      : user.branchIds;

  const summary = await computeDaySummary(prisma, user.businessId, date, branchIds);

  const [moduleSetting] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: "modules" } },
      select: { value: true },
    }),
  ]);

  let miniMartEnabled = true;
  if (moduleSetting) {
    try {
      miniMartEnabled = JSON.parse(moduleSetting.value).miniMartEnabled === true;
    } catch {
      miniMartEnabled = true;
    }
  }

  let pos;
  if (miniMartEnabled) {
    const [salesAgg, itemsWithStock] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          businessId: user.businessId, deletedAt: null, status: "COMPLETED", date,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
        },
        _sum: { total: true, profit: true },
        _count: true,
      }),
      // Every active item, not only the ones with a low-stock threshold: the threshold
      // decides what to warn about, but the value on the shelf is the whole shelf.
      prisma.item.findMany({
        where: { businessId: user.businessId, deletedAt: null, active: true },
        select: {
          id: true, name: true, minStock: true, costPrice: true, sellingPrice: true, expiresAt: true,
          stockLevels: {
            where: branchIds ? { branchId: { in: branchIds } } : undefined,
            select: { quantity: true },
          },
        },
      }),
    ]);

    const withQty = itemsWithStock.map((it) => ({
      ...it,
      qty: it.stockLevels.reduce((a, l) => a + l.quantity, 0),
    }));

    const lowStock = withQty
      .filter((it) => it.minStock > 0 && it.qty < it.minStock)
      .map((it) => ({ id: it.id, name: it.name, minStock: it.minStock, qty: it.qty }));

    // Still on the shelf and past, or within a month of, its best-before date; soonest first.
    const soon = new Date(`${todayBusinessDate()}T00:00:00Z`);
    soon.setUTCDate(soon.getUTCDate() + EXPIRY_WARN_DAYS);
    const expiring = withQty
      .filter((it) => it.expiresAt && it.qty > 0 && it.expiresAt <= soon)
      .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime())
      .map((it) => ({ id: it.id, name: it.name, qty: it.qty, expiresAt: it.expiresAt!.toISOString().slice(0, 10) }));

    // Two figures, because a shop asks two different questions of the same shelf: what it
    // paid for what is sitting there, and what that becomes if it all sells. Negative
    // stock is ignored rather than subtracted — an oversold line is a counting error, not
    // money owed back, and letting it eat into the total hides the error twice over.
    let stockCost = 0n;
    let stockRetail = 0n;
    for (const it of withQty) {
      if (it.qty <= 0) continue;
      stockCost += BigInt(it.qty) * it.costPrice;
      stockRetail += BigInt(it.qty) * it.sellingPrice;
    }

    // Profit and what the shelf cost stay with those who may see costs (null for the rest).
    const costs = canSeeCost(user.permissions);
    pos = {
      salesCount: salesAgg._count,
      salesTotal: salesAgg._sum.total ?? 0n,
      salesProfit: costs ? salesAgg._sum.profit ?? 0n : null,
      lowStock,
      expiring,
      stockCost: costs ? stockCost : null,
      stockRetail,
      stockItems: withQty.filter((it) => it.qty > 0).length,
    };
  }

  const [raw, expense] = await Promise.all([
    computeDayIncome(prisma, user.businessId, date, branchIds, pos?.salesTotal),
    computeDayExpense(prisma, user.businessId, date, branchIds),
  ]);
  const income = { sales: raw.sales, service: raw.service, topup: raw.topup, other: raw.other, total: raw.total, lines: raw.lines };

  // Repair income and profit, for those who may see costs, worked out as the report does:
  // income is repairs paid that day plus service income put in as Other income; what comes off
  // is that day's Daily Service Expense (parts bought for repairs, and other repair costs) and,
  // for a shop buying parts per job, the parts cost typed in on each job paid.
  let service: { charge: bigint; parts: bigint; expense: bigint; profit: bigint; otherIncome: bigint } | null = null;
  if (canSeeCost(user.permissions) && (await loadModuleAccess(user.businessId)).features.repair) {
    const [jobs, flow, serviceCats] = await Promise.all([
      paidTotals(user.businessId, date, branchIds),
      loadRepairFlow(user.businessId),
      prisma.category.findMany({ where: { businessId: user.businessId, type: "EXPENSE", systemKey: "DAILY_SERVICE" }, select: { name: true } }),
    ]);
    const names = new Set(serviceCats.map((c) => c.name.toLowerCase()));
    const spent = expense.lines.filter((l) => names.has(l.label.toLowerCase())).reduce((t, l) => t + l.amount, 0n);
    const parts = flow.parts === "job" ? jobs.parts : 0n;
    const charge = jobs.charge + raw.serviceIncome;
    service = { charge, parts: jobs.parts, expense: spent + parts, profit: charge - spent - parts, otherIncome: raw.serviceIncome };
  }

  return json({
    date, summary, pos, income, expense,
    ...(service ? { service } : {}),
  });
});

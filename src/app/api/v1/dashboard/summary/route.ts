import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computeDaySummary } from "@/services/summaryService";
import { dateRangeUtc, todayBusinessDate } from "@/lib/dates";
import { incomeBucket } from "@/lib/incomeCategories";

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
          id: true, name: true, minStock: true, costPrice: true, sellingPrice: true,
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

    pos = {
      salesCount: salesAgg._count,
      salesTotal: salesAgg._sum.total ?? 0n,
      salesProfit: salesAgg._sum.profit ?? 0n,
      lowStock,
      stockCost,
      stockRetail,
      stockItems: withQty.filter((it) => it.qty > 0).length,
    };
  }

  // Everything the shop took in on the day in one figure: till sales, repair money taken
  // (deposits and payments), the cash from top-up sales, and other income. Income entered
  // under the Daily Sale / Daily Service categories counts with sales and service.
  const range = dateRangeUtc(date);
  const [repairIn, repairOut, topup, salesForIncome, incomeByCategory] = await Promise.all([
    prisma.walletLedgerEntry.aggregate({
      where: {
        businessId: user.businessId, direction: "DEBIT", createdAt: range,
        refType: { in: ["REPAIR_DEPOSIT", "REPAIR_PAYMENT"] },
        wallet: { currency: "MMK" },
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      _sum: { amount: true },
    }),
    // A refund of repair money shows as money out against the same references.
    prisma.walletLedgerEntry.aggregate({
      where: {
        businessId: user.businessId, direction: "CREDIT", createdAt: range,
        refType: { in: ["REPAIR_DEPOSIT", "REPAIR_PAYMENT"] },
        wallet: { currency: "MMK" },
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.billerTxn.aggregate({
      where: {
        businessId: user.businessId, voidedAt: null, createdAt: range, kind: "SALE",
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      _sum: { cashAmount: true },
    }),
    pos
      ? Promise.resolve(pos.salesTotal)
      : prisma.sale.aggregate({
          where: {
            businessId: user.businessId, deletedAt: null, status: "COMPLETED", date,
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
          _sum: { total: true },
        }).then((a) => a._sum.total ?? 0n),
    prisma.incomeExpense.groupBy({
      by: ["categoryName"],
      where: {
        businessId: user.businessId, deletedAt: null, type: "INCOME", status: "COMPLETED", date, currency: "MMK",
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      _sum: { amount: true },
    }),
  ]);
  const byBucket = { sales: 0n, service: 0n, other: 0n };
  for (const row of incomeByCategory) byBucket[incomeBucket(row.categoryName)] += row._sum.amount ?? 0n;
  const repair = (repairIn._sum.amount ?? 0n) - (repairOut._sum.amount ?? 0n);
  const topupSales = topup._sum.cashAmount ?? 0n;
  const income = {
    sales: salesForIncome + byBucket.sales,
    service: repair + byBucket.service,
    topup: topupSales,
    other: byBucket.other,
    total: salesForIncome + byBucket.sales + repair + byBucket.service + topupSales + byBucket.other,
  };

  return json({
    date, summary, pos, income,
  });
});

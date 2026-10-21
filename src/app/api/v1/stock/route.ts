import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { STOCK_REASONS, STOCK_REASON_KEYS, signedQuantity } from "@/lib/stockReasons";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { moveStock } from "@/services/stockService";
import { audit } from "@/lib/audit";
import { dateRangeUtc, isValidBusinessDate, isValidMonth, monthRangeUtc } from "@/lib/dates";

// GET: stock levels (with item info); ?movements=1 returns movements instead — the latest
// 100, or every one in a day (?date=YYYY-MM-DD) or a month (?month=YYYY-MM).
export const GET = withAuth("stock.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("movements") === "1") {
    const date = sp.get("date");
    const month = sp.get("month");
    const range = date && isValidBusinessDate(date) ? dateRangeUtc(date)
      : month && isValidMonth(month) ? monthRangeUtc(month)
      : null;
    const movements = await prisma.stockMovement.findMany({
      where: {
        businessId: user.businessId,
        ...branchScope(user),
        ...(sp.get("itemId") ? { itemId: sp.get("itemId")! } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      include: { item: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      take: range ? 5000 : 100,
    });
    return json(movements);
  }

  const items = await prisma.item.findMany({
    where: { businessId: user.businessId, deletedAt: null },
    include: {
      stockLevels: true,
      unit: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const levels = items.map((it) => {
    const totalQty = it.stockLevels.reduce((a, l) => a + l.quantity, 0);
    return {
      itemId: it.id,
      name: it.name,
      sku: it.sku,
      unit: it.unit?.name,
      category: it.category?.name,
      minStock: it.minStock,
      costPrice: it.costPrice,
      sellingPrice: it.sellingPrice,
      totalQty,
      low: it.minStock > 0 && totalQty < it.minStock,
      byBranch: it.stockLevels,
    };
  });
  return json(levels);
});

const adjustSchema = z.object({
  itemId: z.string().min(1),
  branchId: z.string().min(1),
  quantity: z.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
  /** What happened: used for a repair, damaged, a count error, returned… */
  reasonType: z.enum(STOCK_REASON_KEYS).default("ADJUSTMENT"),
  reason: z.string().trim().max(300).default(""),
  /** For "used for repair": the job the part went into. */
  repairJobId: z.string().optional(),
});

export const POST = withAuth("stock.adjust", async ({ req, user }) => {
  const body = await parseBody(req, adjustSchema);
  await assertBranchAccess(user, body.branchId);
  // The named reasons say what happened; a bare correction or "other" still needs words.
  if (!body.reason && (body.reasonType === "ADJUSTMENT" || body.reasonType === "CORRECTION")) {
    throw new ApiError(422, "A reason is required for stock adjustments");
  }
  const quantity = signedQuantity(body.reasonType, body.quantity);
  const label = STOCK_REASONS.find((r) => r.key === body.reasonType)?.label ?? "Adjustment";

  const result = await prisma.$transaction(async (tx) => {
    const job = body.reasonType === "REPAIR_USE" && body.repairJobId
      ? await tx.repairJob.findFirst({ where: { id: body.repairJobId, businessId: user.businessId, deletedAt: null } })
      : null;
    if (body.repairJobId && body.reasonType === "REPAIR_USE" && !job) throw new ApiError(404, "Repair job not found");
    if (job && (job.status === "DELIVERED" || job.status === "CANCELLED")) {
      throw new ApiError(422, `${job.jobNo} is closed; parts can no longer be added to it`);
    }

    const notes = [label, job ? `for ${job.jobNo} (${job.deviceBrand} ${job.deviceModel})` : "", body.reason]
      .filter(Boolean).join(" — ");
    const r = await moveStock(tx, {
      businessId: user.businessId,
      itemId: body.itemId,
      branchId: body.branchId,
      type: body.reasonType,
      quantity,
      notes,
      refType: job ? "REPAIR" : undefined,
      refId: job?.id,
      createdById: user.id,
    });

    // A part fitted to a phone is a cost of that repair, so it lands on the job and shows
    // up in what the repair actually made.
    if (job) {
      await tx.repairJob.update({
        where: { id: job.id },
        data: { partsCost: { increment: r.item.costPrice * BigInt(-quantity) } },
      });
    }

    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: body.branchId,
      action: "ADJUST", module: "stock", resourceType: "Item", resourceId: body.itemId,
      reason: notes, after: { reasonType: body.reasonType, quantity, qtyAfter: r.qtyAfter, repairJob: job?.jobNo },
    });
    return r;
  });
  return json({ qtyAfter: result.qtyAfter }, { status: 201 });
});

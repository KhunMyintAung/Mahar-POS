import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { STOCK_REASONS, STOCK_REASON_KEYS, signedQuantity } from "@/lib/stockReasons";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { moveStock } from "@/services/stockService";
import { audit } from "@/lib/audit";
import { cleanImeis, receiveSerials, removeSerials, trackedItemIds } from "@/services/serialService";
import { dateRangeUtc, isValidBusinessDate, isValidMonth, monthRangeUtc } from "@/lib/dates";
import { notifyAuditFeed, stockMoveNotice } from "@/lib/telegramNotify";

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
  // How many units of each tracked item have an IMEI recorded on the shelf.
  const serialCounts = await prisma.itemSerial.groupBy({
    by: ["itemId"],
    where: { businessId: user.businessId, status: "IN_STOCK" },
    _count: true,
  });
  const imeiCount = new Map(serialCounts.map((r) => [r.itemId, r._count]));
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
      trackSerial: it.trackSerial,
      imeiInStock: it.trackSerial ? imeiCount.get(it.id) ?? 0 : undefined,
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
  /** For an IMEI-tracked item: the units coming in or going out, one per unit. */
  imeis: z.array(z.string().trim().max(40)).max(500).optional(),
});

export const POST = withAuth("stock.adjust", async ({ req, user }) => {
  const body = await parseBody(req, adjustSchema);
  await assertBranchAccess(user, body.branchId);
  // Without item.manage (a Service Tech) stock only leaves for a repair: no adding stock,
  // no corrections.
  if (body.reasonType !== "REPAIR_USE" && !user.permissions.includes("item.manage")) {
    throw new ApiError(403, "You can only take parts out for a repair.");
  }
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

    // A tracked phone moves with its IMEI: in records it, out marks it removed.
    if ((await trackedItemIds(tx, user.businessId, [body.itemId])).has(body.itemId)) {
      const imeis = cleanImeis(body.imeis);
      if (imeis.length !== Math.abs(quantity)) {
        throw new ApiError(422, `Enter the IMEI of each phone (${Math.abs(quantity)} needed, ${imeis.length} given)`);
      }
      const unit = { businessId: user.businessId, branchId: body.branchId, itemId: body.itemId, imeis, notes };
      if (quantity > 0) await receiveSerials(tx, unit);
      else await removeSerials(tx, unit);
    }
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
    return { ...r, notes };
  });
  notifyAuditFeed(user.businessId, stockMoveNotice({
    itemName: result.item.name, label, quantity, qtyAfter: result.qtyAfter, createdByName: user.name,
    detail: result.notes.startsWith(label) ? result.notes.slice(label.length).replace(/^ — /, "") : result.notes,
  }), undefined, user.id);
  return json({ qtyAfter: result.qtyAfter }, { status: 201 });
});

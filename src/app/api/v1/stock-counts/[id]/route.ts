import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";
import { canSeeCost } from "@/lib/permissions";
import { saveCountEntries } from "@/services/stockCountService";
import { COUNT_REASON_KEYS } from "@/lib/stockCountReasons";

async function findCount(businessId: string, id: string, user: Parameters<typeof canAccessBranch>[0]) {
  const count = await prisma.stockCount.findFirst({ where: { id, businessId } });
  if (!count) throw new ApiError(404, "Stock count not found");
  if (!canAccessBranch(user, count.branchId)) throw new ApiError(403, "No access to this branch");
  return count;
}

// GET: one count, line by line. While it is open each line shows the books as they stand now
// (and, for an IMEI phone, the numbers the books hold), so a sale made meanwhile is seen.
export const GET = withAuth("stock.view", async ({ user, params }) => {
  const count = await findCount(user.businessId, params.id, user);
  const lines = await prisma.stockCountLine.findMany({
    where: { countId: count.id },
    include: {
      item: {
        select: {
          name: true, sku: true, barcode: true, model: true, variant: true, costPrice: true, trackSerial: true,
          category: { select: { name: true, parentId: true } },
        },
      },
    },
  });
  const open = count.status === "OPEN";
  const itemIds = lines.map((l) => l.itemId);
  const [levels, serials, branch, parents] = await Promise.all([
    open ? prisma.stockLevel.findMany({ where: { branchId: count.branchId, itemId: { in: itemIds } }, select: { itemId: true, quantity: true } }) : [],
    open
      ? prisma.itemSerial.findMany({
          where: { businessId: user.businessId, branchId: count.branchId, itemId: { in: lines.filter((l) => l.item.trackSerial).map((l) => l.itemId) }, status: "IN_STOCK" },
          select: { itemId: true, imei: true },
        })
      : [],
    prisma.branch.findFirst({ where: { id: count.branchId }, select: { name: true } }),
    prisma.itemCategory.findMany({
      where: { businessId: user.businessId, id: { in: [...new Set(lines.map((l) => l.item.category?.parentId).filter((x): x is string => Boolean(x)))] } },
      select: { id: true, name: true },
    }),
  ]);
  const live = new Map(levels.map((l) => [l.itemId, l.quantity]));
  const heldImeis = new Map<string, string[]>();
  for (const s of serials) heldImeis.set(s.itemId, [...(heldImeis.get(s.itemId) ?? []), s.imei]);
  const parentName = new Map(parents.map((p) => [p.id, p.name]));
  const seeCost = canSeeCost(user.permissions);

  return json({
    id: count.id, txnNo: count.txnNo, status: count.status, branchId: count.branchId, branch: branch?.name ?? "",
    categoryName: count.categoryName, notes: count.notes, createdAt: count.createdAt, completedAt: count.completedAt,
    lines: lines
      .map((l) => ({
        itemId: l.itemId,
        name: l.item.name,
        sku: l.item.sku,
        barcode: l.item.barcode,
        category: l.item.category
          ? [l.item.category.parentId ? parentName.get(l.item.category.parentId) : null, l.item.category.name].filter(Boolean).join(" › ")
          : "",
        trackSerial: l.item.trackSerial,
        expectedQty: open ? live.get(l.itemId) ?? 0 : l.expectedQty,
        countedQty: l.countedQty,
        countedImeis: l.countedImeis ? l.countedImeis.split(",") : [],
        expectedImeis: open ? heldImeis.get(l.itemId) ?? [] : [],
        adjustment: l.adjustment,
        reason: l.reason,
        note: l.note,
        unitCost: seeCost ? (open ? l.item.costPrice : l.unitCost) : 0n,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  });
});

const schema = z.object({
  entries: z.array(z.object({
    itemId: z.string().min(1),
    // Left out when only a reason is being saved: the figure counted stays as it is.
    countedQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
    imeis: z.array(z.string().trim().max(40)).max(500).optional(),
    reason: z.enum(COUNT_REASON_KEYS).nullable().optional(),
    note: z.string().max(200).nullable().optional(),
  })).min(1).max(500),
});

// PATCH: save what was found on the shelf, for one or more lines.
export const PATCH = withAuth("stock.adjust", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  await findCount(user.businessId, params.id, user);
  await prisma.$transaction((tx) => saveCountEntries(tx, { businessId: user.businessId, id: params.id, entries: body.entries }), { timeout: 30_000 });
  return json({ ok: true });
});

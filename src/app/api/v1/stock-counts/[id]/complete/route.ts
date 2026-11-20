import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";
import { completeStockCount } from "@/services/stockCountService";
import { notifyAuditFeed } from "@/lib/telegramNotify";
import { fmtMoneyPlain } from "@/lib/format";

// POST: finish the count: each counted item's stock (and IMEIs) becomes what was found.
export const POST = withAuth("stock.adjust", async ({ req, user, params }) => {
  if (!user.permissions.includes("item.manage")) throw new ApiError(403, "You cannot finish a stock count");
  // An optional remark from whoever finishes it; no body at all is fine.
  const body = (await req.json().catch(() => ({}))) as { remarks?: unknown };
  const remarks = typeof body.remarks === "string" ? body.remarks.trim().slice(0, 300) : undefined;
  const count = await prisma.stockCount.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { branchId: true } });
  if (!count) throw new ApiError(404, "Stock count not found");
  if (!canAccessBranch(user, count.branchId)) throw new ApiError(403, "No access to this branch");
  const r = await prisma.$transaction(
    (tx) => completeStockCount(tx, { businessId: user.businessId, userId: user.id, id: params.id, remarks }),
    { timeout: 120_000, maxWait: 15_000 }
  );
  notifyAuditFeed(user.businessId, [
    `📋 Stock စစ်ပြီး: ${r.txnNo} · လုပ်သူ: ${user.name}`,
    `စစ်ပြီး ပစ္စည်း ${r.counted} မျိုး`,
    r.short ? `လို: ${r.short} ခု (${fmtMoneyPlain(r.shortValue)})` : "",
    r.over ? `ပို: ${r.over} ခု (${fmtMoneyPlain(r.overValue)})` : "",
  ].filter(Boolean).join("\n"), undefined, user.id);
  return json(r);
});

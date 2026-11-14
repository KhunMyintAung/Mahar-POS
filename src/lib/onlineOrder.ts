import { prisma } from "./prisma";
import { nextNumber } from "./sequence";
import { publicShop } from "./onlineShop";
import { notifyAuditFeed, onlineOrderNotice } from "./telegramNotify";

export type PublicShop = NonNullable<Awaited<ReturnType<typeof publicShop>>>;

export interface OrderInput {
  customerName: string;
  customerPhone: string;
  address?: string;
  note?: string;
  lines: { itemId: string; quantity: number }[];
}

export type OrderResult =
  | { ok: true; orderId: string; orderNo: string; createdAt: Date; total: bigint; lines: { itemId: string; name: string; quantity: number; unitPrice: bigint }[] }
  | { ok: false; status: number; error: string };

/** Saves a customer's order from the Online Shop and tells the shop on Telegram. Prices and
 *  stock are read from the shop, never taken from the browser, so the order is always at the
 *  shop's own prices. Used by the shop page and by the storefront's order form. */
export async function placeOnlineOrder(shop: PublicShop, input: OrderInput): Promise<OrderResult> {
  const byId = new Map(shop.items.map((i) => [i.id, i]));
  const wanted = new Map<string, number>();
  for (const l of input.lines) wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + l.quantity);
  const lines: { itemId: string; name: string; quantity: number; unitPrice: bigint }[] = [];
  for (const [itemId, quantity] of wanted) {
    const item = byId.get(itemId);
    if (!item) return { ok: false, status: 409, error: "An item in your cart is no longer sold online. Please refresh." };
    if (quantity > item.stock) return { ok: false, status: 409, error: `Only ${item.stock} of ${item.name} left` };
    lines.push({ itemId, name: item.name, quantity, unitPrice: item.price });
  }
  const total = lines.reduce((t, l) => t + l.unitPrice * BigInt(l.quantity), 0n);

  const order = await prisma.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, shop.business.id, "ONLINE_ORDER", (n) => `ORD-${String(n).padStart(5, "0")}`);
    return tx.onlineOrder.create({
      data: {
        businessId: shop.business.id, orderNo, customerName: input.customerName, customerPhone: input.customerPhone,
        address: input.address || null, note: input.note || null, total,
        lines: { create: lines },
      },
      select: { id: true, orderNo: true, createdAt: true },
    });
  });
  notifyAuditFeed(shop.business.id, onlineOrderNotice({ ...input, orderNo: order.orderNo, lines, total }), undefined, undefined, { perm: "sale.create", url: "/online-shop" });
  return { ok: true, orderId: order.id, orderNo: order.orderNo, createdAt: order.createdAt, total, lines };
}

import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { allowOrder, publicShop } from "@/lib/onlineShop";
import { notifyAuditFeed, onlineOrderNotice } from "@/lib/telegramNotify";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerName: z.string().trim().min(1, "Enter your name").max(80),
  customerPhone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/, "Enter a phone number"),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(300).optional(),
  lines: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(30),
  /** Left empty by people; a bot filling every field fills this too. */
  website: z.string().max(0).optional(),
});

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** A customer's order from the Online Shop. Prices and stock are read here, never taken
 *  from the browser, so the order is always at the shop's own prices. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!allowOrder(`${slug}:${ip}`)) return reply({ ok: false, error: "Too many orders. Please wait a few minutes, or call the shop." }, 429);
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof ZodError ? e.issues[0]?.message ?? "Check the form" : "Check the form";
    return reply({ ok: false, error: msg }, 422);
  }
  const shop = await publicShop(slug);
  if (!shop) return reply({ ok: false, error: "This shop is not taking orders now" }, 404);

  const byId = new Map(shop.items.map((i) => [i.id, i]));
  const wanted = new Map<string, number>();
  for (const l of body.lines) wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + l.quantity);
  const lines: { itemId: string; name: string; quantity: number; unitPrice: bigint }[] = [];
  for (const [itemId, quantity] of wanted) {
    const item = byId.get(itemId);
    if (!item) return reply({ ok: false, error: "An item in your cart is no longer sold online. Please refresh." }, 409);
    if (quantity > item.stock) return reply({ ok: false, error: `Only ${item.stock} of ${item.name} left` }, 409);
    lines.push({ itemId, name: item.name, quantity, unitPrice: item.price });
  }
  const total = lines.reduce((t, l) => t + l.unitPrice * BigInt(l.quantity), 0n);

  const order = await prisma.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, shop.business.id, "ONLINE_ORDER", (n) => `ORD-${String(n).padStart(5, "0")}`);
    return tx.onlineOrder.create({
      data: {
        businessId: shop.business.id, orderNo, customerName: body.customerName, customerPhone: body.customerPhone,
        address: body.address || null, note: body.note || null, total,
        lines: { create: lines },
      },
      select: { orderNo: true },
    });
  });
  notifyAuditFeed(shop.business.id, onlineOrderNotice({ ...body, orderNo: order.orderNo, lines, total }));
  return reply({ ok: true, orderNo: order.orderNo, total: total.toString() });
}

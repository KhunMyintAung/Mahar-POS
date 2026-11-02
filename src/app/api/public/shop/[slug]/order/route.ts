import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { clientIp } from "@/lib/client-ip";
import { allowOrder, publicShop } from "@/lib/onlineShop";
import { placeOnlineOrder } from "@/lib/onlineOrder";

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

/** A customer's order from the Online Shop page. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = clientIp(req.headers);
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

  const result = await placeOnlineOrder(shop, body);
  if (!result.ok) return reply({ ok: false, error: result.error }, result.status);
  return reply({ ok: true, orderNo: result.orderNo, total: result.total.toString() });
}

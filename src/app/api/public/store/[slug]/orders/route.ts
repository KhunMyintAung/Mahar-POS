import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { clientIp } from "@/lib/client-ip";
import { allowOrder, publicShop } from "@/lib/onlineShop";
import { placeOnlineOrder } from "@/lib/onlineOrder";
import { storefrontOrder } from "@/lib/storefrontApi";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerName: z.string().trim().min(1, "နာမည် ထည့်ပါ").max(80),
  customerPhone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/, "ဖုန်းနံပါတ် ထည့်ပါ"),
  deliveryAddress: z.string().trim().max(300).nullish(),
  fulfillmentMethod: z.string().max(20).nullish(),
  note: z.string().trim().max(280).nullish(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(30),
});

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** An order from the storefront page's checkout. It lands in Online Shop → Orders like one
 *  from the shop page. The page reads errors from `message`. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!allowOrder(`${slug}:${clientIp(req.headers)}`)) return reply({ message: "အော်ဒါ များလွန်းနေပါသည်။ ခဏစောင့်ပါ (သို့) ဆိုင်ကို ဖုန်းဆက်ပါ။" }, 429);
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return reply({ message: e instanceof ZodError ? e.issues[0]?.message ?? "Check the form" : "Check the form" }, 422);
  }
  const shop = await publicShop(slug);
  if (!shop) return reply({ message: "ဆိုင်က ယခု အော်ဒါ မလက်ခံနိုင်သေးပါ" }, 404);

  const pickup = body.fulfillmentMethod === "PICKUP";
  const result = await placeOnlineOrder(shop, {
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    address: pickup ? "ဆိုင်တွင် လာယူမည် (Pickup)" : body.deliveryAddress || undefined,
    note: body.note || undefined,
    lines: body.items.map((i) => ({ itemId: i.variantId, quantity: i.quantity })),
  });
  if (!result.ok) return reply({ message: result.error }, result.status);
  return reply({ ok: true, order: storefrontOrder(result) });
}

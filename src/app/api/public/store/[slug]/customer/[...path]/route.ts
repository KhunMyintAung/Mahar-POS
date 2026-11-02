import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The storefront page's customer accounts (Google sign-in, a cart and orders kept on the
 *  server) belonged to the first Mahar POS. Here a customer orders without an account: the
 *  page keeps the cart and past orders on the phone, and these answer so it carries on
 *  quietly — nobody signed in, an empty server cart. */

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const route = async (ctx: { params: Promise<{ path: string[] }> }) => (await ctx.params).path.join("/");

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  const path = await route(ctx);
  if (path === "me") return reply({ customer: null });
  if (path === "cart") return reply({ cart: { items: [] } });
  if (path === "orders") return reply({ orders: [] });
  return reply({ message: "Not found" }, 404);
}

export async function PUT(_req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  return (await route(ctx)) === "cart" ? reply({ cart: { items: [] } }) : reply({ message: "Not found" }, 404);
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  const path = await route(ctx);
  if (path === "logout") return reply({ ok: true });
  if (path === "google/login") return reply({ message: "Google ဖြင့် ဝင်ရန် မလိုပါ — အကောင့်မဖွင့်ဘဲ အော်ဒါ တင်နိုင်ပါသည်။" }, 422);
  return reply({ message: "Not found" }, 404);
}

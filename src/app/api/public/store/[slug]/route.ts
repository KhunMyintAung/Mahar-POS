import { NextRequest, NextResponse } from "next/server";
import { loadShopCover, publicShop } from "@/lib/onlineShop";
import { storefrontStore } from "@/lib/storefrontApi";

export const dynamic = "force-dynamic";

/** The shop, for the storefront page at maharpos.shop/shop/<address> (see storefrontApi). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await publicShop(slug);
  if (!shop) return NextResponse.json({ message: "Shop not found" }, { status: 404 });
  const cover = await loadShopCover(shop.business.id);
  return NextResponse.json({ ok: true, store: storefrontStore(shop, slug, cover?.version ?? null) }, { headers: { "Cache-Control": "no-store" } });
}

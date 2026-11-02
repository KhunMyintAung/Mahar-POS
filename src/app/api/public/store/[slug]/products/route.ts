import { NextRequest, NextResponse } from "next/server";
import { publicShop } from "@/lib/onlineShop";
import { storefrontProducts } from "@/lib/storefrontApi";

export const dynamic = "force-dynamic";

/** The shop's items shown online, for the storefront page, with its search and filters. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await publicShop(slug);
  if (!shop) return NextResponse.json({ message: "Shop not found" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const body = storefrontProducts(shop.items, {
    page: Number(q.get("page")) || 1,
    search: q.get("search") ?? "",
    categoryId: q.get("categoryId") ?? "",
    stockLevel: q.get("stockLevel") ?? "",
  });
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

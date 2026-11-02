import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { coverImageResponse, loadOnlineShop, loadShopCover } from "@/lib/onlineShop";

export const dynamic = "force-dynamic";

/** A shop's cover photo, for the top of its Online Shop page. Under /api/public/shop/ so that
 *  maharpos.shop, which passes that path to this app, serves it too. The page asks for it with
 *  ?v=<when it was set>, so a browser may keep each version a long time. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { shopSlug: slug }, select: { id: true } });
  if (!business || !(await loadOnlineShop(business.id)).enabled) return new NextResponse(null, { status: 404 });
  const cover = await loadShopCover(business.id);
  return cover ? coverImageResponse(cover.dataUrl, "public, max-age=31536000, immutable") : new NextResponse(null, { status: 404 });
}

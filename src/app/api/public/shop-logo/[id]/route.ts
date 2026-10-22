import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** A shop's logo as an image, for the landing page's shop cards. Logos are stored as data
 *  URLs; this serves the picture itself so the page does not carry them inline.
 *  SVG is never served: from this origin it could carry script. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await prisma.business.findUnique({ where: { id }, select: { logoUrl: true } });
  const m = business?.logoUrl?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}

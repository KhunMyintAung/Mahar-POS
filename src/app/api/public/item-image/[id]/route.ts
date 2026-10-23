import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** An item's photo, for the Online Shop and the app's own Products tab. Only the types an
 *  upload is allowed to be (never SVG, which could carry script from this origin). A photo
 *  never changes once added (a new one gets a new id), so browsers may keep it a long time. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const image = await prisma.itemImage.findUnique({ where: { id }, select: { mime: true, data: true } });
  if (!image || !/^image\/(jpeg|webp|png)$/.test(image.mime)) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

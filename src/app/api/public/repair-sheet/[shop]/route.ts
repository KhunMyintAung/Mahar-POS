import { NextRequest, NextResponse } from "next/server";
import { fetchRepairSheetLive, findRepairShop } from "@/lib/repair-sheet";

export const dynamic = "force-dynamic";

/** A shop's repair list as it is in the Google Sheet now, for /repair-sheet/<shop> to
 *  refresh itself every second. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ shop: string }> }) {
  const shop = await findRepairShop((await params).shop);
  if (!shop) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const sheet = await fetchRepairSheetLive(shop.gid);
    if (!sheet) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json(sheet, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[repair sheet live]", e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

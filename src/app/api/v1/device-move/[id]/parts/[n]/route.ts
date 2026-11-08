import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { savePart } from "@/services/deviceMove";

/** One part of a shop being moved (src/services/deviceMove.ts): ?of= the number of parts. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; n: string }> }) {
  try {
    const { id, n } = await ctx.params;
    const total = Number(req.nextUrl.searchParams.get("of"));
    await savePart(id, Number(n), total, new Uint8Array(await req.arrayBuffer()));
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

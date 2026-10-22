import { NextRequest } from "next/server";
import { publicJson } from "@/lib/publicResponse";
import { publicActiveUsers } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

/** The most active shops of the last 30 days, for the landing page. */
export async function GET(req: NextRequest) {
  const limit = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 4));
  try {
    return publicJson(await publicActiveUsers(limit));
  } catch (e) {
    console.error("[public active users]", e);
    return publicJson({ ok: false }, 500);
  }
}

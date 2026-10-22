import { NextRequest } from "next/server";
import { publicJson } from "@/lib/publicResponse";
import { publicStats } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

/** Shop counts for the landing page. */
export async function GET(req: NextRequest) {
  try {
    return publicJson(await publicStats(), 200, req.headers.get("origin"));
  } catch (e) {
    console.error("[public stats]", e);
    return publicJson({ ok: false }, 500, req.headers.get("origin"));
  }
}

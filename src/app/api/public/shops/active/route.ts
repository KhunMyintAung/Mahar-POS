import { NextRequest } from "next/server";
import { publicJson } from "@/lib/publicResponse";
import { publicShops } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

/** The shops directory on the landing page: ?page=&limit=&businessType=&location=&search= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    return publicJson(await publicShops({
      page: Math.max(1, Number(sp.get("page")) || 1),
      limit: Math.min(48, Math.max(1, Number(sp.get("limit")) || 12)),
      search: (sp.get("search") ?? "").slice(0, 80),
      location: (sp.get("location") ?? "").slice(0, 80),
      businessType: (sp.get("businessType") ?? "").slice(0, 40),
    }), 200, req.headers.get("origin"));
  } catch (e) {
    console.error("[public shops]", e);
    return publicJson({ ok: false }, 500, req.headers.get("origin"));
  }
}

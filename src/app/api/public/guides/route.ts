import { NextRequest } from "next/server";
import { publicJson } from "@/lib/publicResponse";
import { MANUAL, MANUAL_CATEGORY_LABEL } from "@/lib/manual";

export const dynamic = "force-dynamic";

/** How-to guides for the landing page (maharpos.shop), from the user manual (src/lib/manual.ts).
 *  Categories match the page's filter chips: start, pos, manage. A card shows the steps'
 *  headings only; the full guide, with each step explained, is at manualUrl. */
export async function GET(req: NextRequest) {
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  return publicJson({
    ok: true,
    total: MANUAL.length,
    guides: MANUAL.slice(0, limit).map((g) => ({
      slug: g.slug,
      category: g.category,
      title: g.title,
      description: g.description,
      steps: g.steps.map((s) => s.t),
      categoryLabel: MANUAL_CATEGORY_LABEL[g.category],
      manualUrl: `https://maharpos.shop/manual/${g.slug}`,
    })),
  });
}

import type { NextRequest } from "next/server";
import { MANUAL, manualGuide } from "@/lib/manual";
import { isTranslatedLang } from "@/lib/manualI18n";
import { htmlResponse, manualGuideHtml, manualIndexHtml } from "@/lib/manualHtml";

export const dynamic = "force-static";

export function generateStaticParams() {
  return (["en", "th"] as const).flatMap((slug) => MANUAL.map((g) => ({ slug, guide: g.slug })));
}

/** One guide in English (/manual/en/<guide>) or Thai (/manual/th/<guide>). Public. Anything
 *  else under this shape shows the contents page as not found. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; guide: string }> }) {
  const { slug, guide } = await params;
  if (!isTranslatedLang(slug)) return htmlResponse(manualIndexHtml(), 404);
  const found = manualGuide(guide);
  return found ? htmlResponse(manualGuideHtml(found, slug)) : htmlResponse(manualIndexHtml(slug), 404);
}

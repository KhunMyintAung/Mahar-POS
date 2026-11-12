import type { NextRequest } from "next/server";
import { MANUAL, manualGuide } from "@/lib/manual";
import { isTranslatedLang } from "@/lib/manualI18n";
import { htmlResponse, manualGuideHtml, manualIndexHtml } from "@/lib/manualHtml";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [...MANUAL.map((g) => ({ slug: g.slug })), { slug: "en" }, { slug: "th" }];
}

/** One guide of the user manual in Myanmar, or the contents page in English (/manual/en) or
 *  Thai (/manual/th). Public. An unknown guide shows the contents page. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (isTranslatedLang(slug)) return htmlResponse(manualIndexHtml(slug));
  const guide = manualGuide(slug);
  return guide ? htmlResponse(manualGuideHtml(guide)) : htmlResponse(manualIndexHtml(), 404);
}

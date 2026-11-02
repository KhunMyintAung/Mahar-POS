import type { NextRequest } from "next/server";
import { MANUAL, manualGuide } from "@/lib/manual";
import { htmlResponse, manualGuideHtml, manualIndexHtml } from "@/lib/manualHtml";

export const dynamic = "force-static";

export function generateStaticParams() {
  return MANUAL.map((g) => ({ slug: g.slug }));
}

/** One guide of the user manual, public. An unknown guide shows the contents page. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = manualGuide(slug);
  return guide ? htmlResponse(manualGuideHtml(guide)) : htmlResponse(manualIndexHtml(), 404);
}

import { htmlResponse, manualIndexHtml } from "@/lib/manualHtml";

export const dynamic = "force-static";

/** The user manual's contents page, public. Also served at maharpos.shop/manual. */
export function GET() {
  return htmlResponse(manualIndexHtml());
}

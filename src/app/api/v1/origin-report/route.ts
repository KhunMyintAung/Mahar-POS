import { NextRequest, NextResponse } from "next/server";

/** Where a copied build phones home. A build of this app served from a host that is not ours
 *  (see src/lib/origin.ts) pings this once per visitor session with only its own hostname, so
 *  we learn the copy exists. No authentication: a copy is, by definition, not signed in.
 *
 *  It records nothing but the reporting host, and never a shop's data or any person — the
 *  caller sends none. The line lands in the server log for us to read. */
export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("h") ?? "";
  // Only a plausible hostname, capped, so the log cannot be stuffed with junk.
  const host = raw.slice(0, 120).replace(/[^a-zA-Z0-9.:_-]/g, "");
  if (host) console.warn(`[origin-report] copy served from: ${host}`);
  // 204 and no body: the copy's page asked for an image and gets nothing to show.
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

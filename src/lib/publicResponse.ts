import { NextResponse } from "next/server";

/** The public sites that read these figures directly: the Mahar POS landing page and the
 *  Mahar Shwe company site. */
const SITES = ["https://maharpos.shop", "https://maharshwe.shop"];

/** JSON for the public sites, allowed to the one that asked. */
export function publicJson(body: unknown, status = 200, origin?: string | null) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin && SITES.includes(origin) ? origin : SITES[0],
      Vary: "Origin",
      "Cache-Control": "public, max-age=60",
    },
  });
}

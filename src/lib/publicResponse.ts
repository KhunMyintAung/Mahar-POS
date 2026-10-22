import { NextResponse } from "next/server";

/** JSON for the public landing page (maharpos.shop), which may read it directly. */
export function publicJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "https://maharpos.shop", "Cache-Control": "public, max-age=60" },
  });
}

import { publicJson } from "@/lib/publicResponse";
import { publicStats } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

/** Shop counts for the landing page. */
export async function GET() {
  try {
    return publicJson(await publicStats());
  } catch (e) {
    console.error("[public stats]", e);
    return publicJson({ ok: false }, 500);
  }
}

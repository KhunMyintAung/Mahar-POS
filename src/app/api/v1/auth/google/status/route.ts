import { NextResponse } from "next/server";
import { googleConfig } from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

/** Whether this deployment can offer Google sign-in, so the login page shows the button
 *  only when it would work. Reports a yes or no and nothing else — the client id and
 *  secret stay on the server.
 *
 *  Wrapped in the { ok, data } envelope every other endpoint uses: the shared client
 *  treats a bare body as a failure, which silently hid the button.
 */
export async function GET() {
  return NextResponse.json({ ok: true, data: { enabled: googleConfig() !== null } });
}

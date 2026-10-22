import { NextResponse } from "next/server";
import { googleClientId, googleConfig } from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

/** Whether this deployment can offer Google sign-in, and how. With a client secret the
 *  button runs the redirect flow; with only a client id it shows Google's own button, which
 *  needs the (public) client id in the browser. The secret never leaves the server.
 *
 *  Wrapped in the { ok, data } envelope every other endpoint uses: the shared client
 *  treats a bare body as a failure, which silently hid the button.
 */
export async function GET() {
  const redirect = googleConfig() !== null;
  const clientId = googleClientId();
  return NextResponse.json({ ok: true, data: { enabled: redirect || Boolean(clientId), clientId: redirect ? null : clientId } });
}

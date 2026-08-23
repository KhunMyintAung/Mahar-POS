import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { googleAuthUrl, googleConfig, GOOGLE_STATE_COOKIE } from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = googleConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/login?error=google_unavailable", process.env.APP_URL ?? "http://localhost:3000")
    );
  }

  // Carried in a cookie and echoed back by Google, so a callback that did not start here
  // can be told apart from one that did — without it, anyone could hand a victim a link
  // that logs them into someone else's account.
  const state = randomBytes(32).toString("hex");
  const response = NextResponse.redirect(googleAuthUrl(config, state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}

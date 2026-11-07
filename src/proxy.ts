import { NextRequest, NextResponse } from "next/server";
import { EDITION_COOKIE, isPlayEdition } from "@/lib/edition";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/full-app") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    // The installed app (PWA) starts here: the page knows it is the app (src/lib/installedApp.ts).
    destination.search = "?from=pwa";
    const response = NextResponse.redirect(destination);
    response.cookies.set(EDITION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  // The Play Store app opens here: from then on this phone gets the store build.
  if (request.nextUrl.pathname === "/play-app") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "?from=app";
    const response = NextResponse.redirect(destination);
    response.cookies.set(EDITION_COOKIE, "play", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  if (!isPlayEdition(request.cookies.get(EDITION_COOKIE)?.value)) return NextResponse.next();

  const response = NextResponse.next();
  response.headers.set("X-Wallet-Edition", "play");
  return response;
}

export const config = {
  matcher: [
    "/full-app",
    "/play-app",
    "/api/:path*",
  ],
};

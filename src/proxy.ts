import { NextRequest, NextResponse } from "next/server";
import { isPlayEdition } from "@/lib/edition";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/full-app") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    const response = NextResponse.redirect(destination);
    response.cookies.set("wn_edition", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (request.nextUrl.pathname === "/play-app") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    const response = NextResponse.redirect(destination);
    response.cookies.set("wn_edition", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (!isPlayEdition()) return NextResponse.next();

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

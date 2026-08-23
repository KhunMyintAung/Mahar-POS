import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, destroyAllSessions, getAuthUser, SESSION_COOKIE } from "@/lib/auth";
import { handleError } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const all = req.nextUrl.searchParams.get("all") === "1";
    if (token) {
      if (all) {
        const user = await getAuthUser();
        if (user) await destroyAllSessions(user.id);
      } else {
        await destroySession(token);
      }
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (e) {
    return handleError(e);
  }
}

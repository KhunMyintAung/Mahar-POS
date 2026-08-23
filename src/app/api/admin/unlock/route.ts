import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminPasscode, issueUnlockToken, passcodeMatches } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

/** A shared passcode with no account behind it is worth rate-limiting: without this, the
 *  portal is one long guessing loop away from being open. Kept in memory rather than the
 *  database because it only has to survive as long as the process an attacker is talking
 *  to, and a database write per guess is its own denial of service. */
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

function tooManyAttempts(ip: string, now: number): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.until < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string, now: number) {
  const entry = attempts.get(ip);
  if (!entry || entry.until < now) {
    attempts.set(ip, { count: 1, until: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export async function POST(req: NextRequest) {
  if (!adminPasscode()) {
    return NextResponse.json(
      { ok: false, error: "No admin passcode is configured for this deployment." },
      { status: 503 }
    );
  }

  const now = Date.now();
  // Cloudflare sits in front, so the first hop is the edge; the real client is in the
  // forwarded header. Falling back to the socket address keeps the limit working if the
  // proxy is ever removed.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (tooManyAttempts(ip, now)) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";

  if (!passcodeMatches(passcode)) {
    recordFailure(ip, now);
    return NextResponse.json({ ok: false, error: "Wrong passcode." }, { status: 401 });
  }

  attempts.delete(ip);
  const token = issueUnlockToken(now);
  const res = NextResponse.json({ ok: true, data: { unlocked: true } });
  res.cookies.set(ADMIN_COOKIE, token.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: token.maxAge,
  });
  return res;
}

/** Lock it again — useful on a shared machine, and the only way to drop the cookie early. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true, data: { unlocked: false } });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

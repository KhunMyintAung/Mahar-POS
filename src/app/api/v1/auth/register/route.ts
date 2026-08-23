import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { errorJson, handleError, parseBody } from "@/lib/api";
import { registerTenant } from "@/lib/tenant";

const schema = z.object({
  businessName: z.string().trim().min(2).max(80),
  ownerName: z.string().trim().min(2).max(80).optional(),
  username: z.string().trim().toLowerCase().min(3).max(40),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  currency: z.enum(["MMK", "THB"]).default("MMK"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Yangon"),
  businessCategory: z.enum(["PERSONAL", "MINI_MART", "MOBILE_SHOP", "ALL_IN_ONE"]).optional(),
  moduleMode: z.enum(["WALLET_ONLY", "MINI_MART_ONLY", "BOTH"]).optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function allowRegistration(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60 * 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!allowRegistration(ip)) {
      return errorJson(429, "Too many registration attempts. Try again later.");
    }

    const input = await parseBody(req, schema);
    const { owner } = await registerTenant(input);
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const { token, expiresAt } = await createSession(owner.id, { ip, userAgent });

    const res = NextResponse.json({
      ok: true,
      data: { name: owner.name, username: owner.username },
    }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
    });
    return res;
  } catch (error) {
    return handleError(error);
  }
}

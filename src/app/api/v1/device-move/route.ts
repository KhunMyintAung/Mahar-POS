import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { errorJson, handleError, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PART_BYTES, startMove } from "@/services/deviceMove";

// Moving a "This device only" shop into an online account, step 1: the account it goes into.
// Then the device sends the shop in parts (./[id]/parts/[n]) and finishes (./[id]/finish).
// Like signing up, no account is needed to start.

const schema = z.object({
  // As on the sign-up form.
  username: z.string().trim().toLowerCase().min(3).max(40)
    .regex(/^[a-z0-9_.-]+$/, "Username: letters, numbers, dots, dashes and underscores only"),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function allow(ip: string) {
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
    if (!allow(ip)) return errorJson(429, "Too many attempts. Try again later.");
    const input = await parseBody(req, schema);
    const taken = await prisma.user.findFirst({
      where: { OR: [{ username: input.username }, { email: input.username }, { username: input.email }, { email: input.email }] },
      select: { id: true },
    });
    if (taken) return errorJson(409, "Username or email is already registered");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const id = await startMove({ username: input.username, email: input.email, passwordHash, ip });
    return json({ id, partBytes: PART_BYTES }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

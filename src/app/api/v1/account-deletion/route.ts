import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(40),
  email: z.string().trim().toLowerCase().email().max(160),
  reason: z.string().trim().max(300).optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function allowed(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60 * 60_000 });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!allowed(ip)) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
    }

    const input = await parseBody(req, schema);
    const owner = await prisma.user.findFirst({
      where: {
        username: input.username,
        email: input.email,
        deletedAt: null,
        role: { name: "Owner" },
      },
      select: { id: true, businessId: true },
    });

    if (owner) {
      const existing = await prisma.auditLog.findFirst({
        where: {
          businessId: owner.businessId,
          userId: owner.id,
          action: "ACCOUNT_DELETION_REQUEST",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.auditLog.create({
          data: {
            businessId: owner.businessId,
            userId: owner.id,
            action: "ACCOUNT_DELETION_REQUEST",
            module: "account",
            resourceType: "Business",
            resourceId: owner.businessId,
            reason: input.reason,
            ip,
            userAgent: req.headers.get("user-agent") ?? undefined,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: { accepted: true },
    });
  } catch (error) {
    return handleError(error);
  }
}

import { z } from "zod";
import { cookies } from "next/headers";
import { errorJson, json, parseBody, withAuth } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { purgeBusiness } from "@/services/accountDeletionService";

export const dynamic = "force-dynamic";

const schema = z.object({
  // The business name has to be typed back. There is no undo, so the confirmation is
  // deliberately something you cannot produce by clicking through.
  confirmName: z.string().trim().min(1),
});

export const POST = withAuth(null, async ({ req, user }) => {
  if (user.roleName !== "Owner") {
    return errorJson(403, "Only the account Owner can delete the business");
  }

  const body = await parseBody(req, schema);
  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { id: true, name: true },
  });
  if (!business) return errorJson(404, "Business not found");

  if (body.confirmName.trim().toLowerCase() !== business.name.trim().toLowerCase()) {
    return errorJson(400, "The name you typed does not match this business");
  }

  // One transaction: a wrong or incomplete delete order fails on a foreign key and rolls
  // back, so the outcome is either a clean wipe or nothing at all.
  const summary = await prisma.$transaction((tx) => purgeBusiness(tx, business.id), {
    timeout: 30_000,
  });

  // The session's user row is gone; clear the cookie so the browser is not left holding
  // a token that no longer resolves.
  (await cookies()).delete(SESSION_COOKIE);

  return json({ ok: true, data: summary });
});

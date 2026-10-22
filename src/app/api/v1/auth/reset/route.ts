import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { errorJson, handleError, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { userForResetToken } from "@/lib/passwordReset";

/** Sets a new password from an emailed link. Every signed-in session of that account is
 *  ended, so whoever might have known the old password is out. */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req, z.object({
      token: z.string().min(10).max(500),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
    }));
    const user = await userForResetToken(body.token);
    if (!user) return errorJson(400, "This link has expired or was already used. Ask for a new one.");
    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
      await tx.authSession.deleteMany({ where: { userId: user.id } });
      await audit(tx, { businessId: user.businessId, userId: user.id, action: "UPDATE", module: "auth", resourceType: "User", resourceId: user.id, after: { passwordReset: "email link" } });
    });
    return NextResponse.json({ ok: true, data: { username: user.username } });
  } catch (error) {
    return handleError(error);
  }
}

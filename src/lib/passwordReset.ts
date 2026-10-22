import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

/** Password reset links without a table: the token carries the user and an expiry, signed
 *  with AUTH_SECRET over the current password hash. Setting a new password changes the
 *  hash, so a link works once; it also lapses after an hour. */

const HOUR = 60 * 60 * 1000;

function sign(userId: string, expires: number, passwordHash: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`${userId}.${expires}.${passwordHash}`).digest("base64url");
}

export function makeResetToken(user: { id: string; passwordHash: string }): string {
  const expires = Date.now() + HOUR;
  return `${Buffer.from(user.id).toString("base64url")}.${expires}.${sign(user.id, expires, user.passwordHash)}`;
}

/** The user the token was made for, or null when it is wrong, used or out of date. */
export async function userForResetToken(token: string) {
  const [idPart, expPart, sig] = token.split(".");
  if (!idPart || !expPart || !sig) return null;
  const expires = Number(expPart);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  const userId = Buffer.from(idPart, "base64url").toString();
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, active: true } });
  if (!user) return null;
  const expected = Buffer.from(sign(user.id, expires, user.passwordHash));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return user;
}

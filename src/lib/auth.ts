import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "wn_session";
const SESSION_DAYS = 7;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export interface AuthUser {
  id: string;
  businessId: string;
  name: string;
  username: string;
  roleName: string;
  permissions: string[];
  allBranches: boolean;
  branchIds: string[];
  commissionRate: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await prisma.authSession.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}

export async function destroyAllSessions(userId: string) {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Resolve the current user from the session cookie. Returns null when not signed in. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { role: true, branches: true } },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (!u.active || u.deletedAt) return null;

  return {
    id: u.id,
    businessId: u.businessId,
    name: u.name,
    username: u.username,
    roleName: u.role.name,
    permissions: JSON.parse(u.role.permissions) as string[],
    allBranches: u.allBranches,
    branchIds: u.branches.map((b) => b.branchId),
    commissionRate: u.commissionRate,
  };
}

export function can(user: AuthUser, perm: Permission): boolean {
  return user.permissions.includes(perm);
}

/** Branch scope filter for queries: restrict to branches the user may access. */
export function branchScope(user: AuthUser): { branchId?: { in: string[] } } {
  if (user.allBranches) return {};
  return { branchId: { in: user.branchIds } };
}

export function canAccessBranch(user: AuthUser, branchId: string): boolean {
  return user.allBranches || user.branchIds.includes(branchId);
}

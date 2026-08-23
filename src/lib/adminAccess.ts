import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getAuthUser } from "./auth";
import { prisma } from "./prisma";

export const ADMIN_COOKIE = "wn_admin";
/** Long enough for a session at the desk, short enough that a shared machine forgets. */
const UNLOCK_HOURS = 8;

/** Who may read the cross-tenant admin panel.
 *
 *  Two ways in, and both have to be configured deliberately. ADMIN_PASSCODE lets whoever
 *  runs the platform reach it from any browser without an account; ADMIN_USERS names
 *  accounts that get in on sight, by username or email.
 *
 *  It cannot simply be "any signed-in Owner". Every account in this deployment is an Owner
 *  of its own business, so that check lets any registered user read all of them — and since
 *  anyone can register with Google, that is everyone. The panel reports other businesses'
 *  names, their users, and their audit history, which is not ours to hand out.
 *
 *  Neither setting configured means nobody, because a panel that opens to everyone when a
 *  setting is missing is the failure worth avoiding.
 */
export function adminUsers(): string[] {
  return (process.env.ADMIN_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminIdentity(
  user: { username?: string | null; email?: string | null } | null | undefined
): boolean {
  if (!user) return false;
  const allowed = adminUsers();
  if (allowed.length === 0) return false;
  const username = user.username?.toLowerCase();
  const email = user.email?.toLowerCase();
  return (
    (username !== undefined && username !== null && allowed.includes(username)) ||
    (email !== undefined && email !== null && allowed.includes(email))
  );
}

/** The shared passcode for the grand admin portal, if one is configured. */
export function adminPasscode(): string | null {
  const value = process.env.ADMIN_PASSCODE?.trim();
  return value ? value : null;
}

/** Compare a typed passcode against the configured one without leaking its length.
 *
 *  Both sides are hashed first, so the comparison is always over 32 bytes whatever was
 *  typed. Comparing the raw strings meant a Burmese passcode — several bytes per
 *  character — produced buffers of different lengths, and timingSafeEqual throws rather
 *  than returning false on a length mismatch, which took the page down instead of
 *  refusing the attempt.
 */
export function passcodeMatches(input: string): boolean {
  const expected = adminPasscode();
  if (!expected) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(input), digest(expected));
}

/** The value stored in the unlock cookie: an expiry, signed so it cannot be forged.
 *
 *  The passcode itself is never put in the cookie. A stolen cookie is then worth only the
 *  hours left on it, and cannot be replayed into somewhere else the passcode is used.
 */
function sign(expiresAt: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(String(expiresAt)).digest("hex");
}

export function issueUnlockToken(now = Date.now()): { value: string; maxAge: number } {
  const expiresAt = now + UNLOCK_HOURS * 3600_000;
  return { value: `${expiresAt}.${sign(expiresAt)}`, maxAge: UNLOCK_HOURS * 3600 };
}

export function unlockTokenValid(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [rawExpiry, signature] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || !signature) return false;
  const expected = sign(expiresAt);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/** True when the caller has unlocked the portal with the passcode. */
export async function hasUnlockCookie(): Promise<boolean> {
  const jar = await cookies();
  return unlockTokenValid(jar.get(ADMIN_COOKIE)?.value);
}

/** True when the caller's session belongs to someone on the list. */
export async function isAdminIdentityRequest(): Promise<boolean> {
  if (adminUsers().length === 0) return false;
  const session = await getAuthUser();
  if (!session) return false;
  // The session carries the username; the email is read alongside it so the list can name
  // either — a Google signup's username is derived, and its address is what a person knows.
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { username: true, email: true, active: true, deletedAt: true },
  });
  if (!user || !user.active || user.deletedAt) return false;
  return isAdminIdentity(user);
}

/** Whether this request may see the detail: either the passcode has been entered, or the
 *  signed-in account is on the named list. Two ways in, both deliberate. */
export async function isAdminRequest(): Promise<boolean> {
  if (await hasUnlockCookie()) return true;
  return isAdminIdentityRequest();
}

/** Whether the portal is gated at all. Used by the page to decide between showing an
 *  unlock form and saying that no passcode has been configured. */
export function adminGateConfigured(): boolean {
  return adminPasscode() !== null || adminUsers().length > 0;
}

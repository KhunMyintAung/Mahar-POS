import { ApiError } from "./api";
import type { AuthUser } from "./auth";

/** Who may hand out which role.
 *
 *  `users.manage` lets someone add and edit logins, but on its own it said nothing about
 *  which roles they could give. The Admin role holds it without settings or staff, so an
 *  Admin could give themselves the Owner role, make a role with every permission, or set
 *  the Owner's password and lock the Owner out. These rules close that: nobody gives a
 *  permission they do not hold, and only an Owner changes an Owner. */

export const OWNER_ROLE = "Owner";

export function isOwner(user: Pick<AuthUser, "roleName">): boolean {
  return user.roleName === OWNER_ROLE;
}

/** The permissions in a role that the actor does not hold themselves. */
export function permissionsBeyond(actor: Pick<AuthUser, "permissions">, rolePermissions: string[]): string[] {
  return rolePermissions.filter((p) => !actor.permissions.includes(p));
}

/** Refuses a role (to give or to create) holding any permission the actor does not. */
export function assertCanGrant(actor: Pick<AuthUser, "permissions">, rolePermissions: string[]) {
  if (permissionsBeyond(actor, rolePermissions).length > 0) {
    throw new ApiError(403, "You cannot give permissions you do not have yourself");
  }
}

/** Refuses a change to an Owner's login (password, role, switching off) by anyone but an Owner. */
export function assertCanChangeUser(actor: Pick<AuthUser, "id" | "roleName">, target: { id: string; roleName: string }, changesRole: boolean) {
  if (target.roleName === OWNER_ROLE && !isOwner(actor)) {
    throw new ApiError(403, "Only an Owner can change an Owner's login");
  }
  if (changesRole && target.id === actor.id && !isOwner(actor)) {
    throw new ApiError(403, "You cannot change your own role");
  }
}

/** A role's stored permission list. */
export function rolePermissions(role: { permissions: string }): string[] {
  try {
    const parsed = JSON.parse(role.permissions);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

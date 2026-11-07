import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "@/lib/permissions";
import { assertCanChangeUser, assertCanGrant, permissionsBeyond, rolePermissions } from "@/lib/roleGuard";

const role = (name: string) => {
  const r = DEFAULT_ROLES.find((x) => x.name === name);
  if (!r) throw new Error(`no role ${name}`);
  return r.permissions as string[];
};

const owner = { id: "owner-1", roleName: "Owner", permissions: [...ALL_PERMISSIONS] as string[] };
const admin = { id: "admin-1", roleName: "Admin", permissions: role("Admin") };

describe("who may give which role", () => {
  it("an Admin cannot give the Owner role, or make a role as strong", () => {
    expect(() => assertCanGrant(admin, role("Owner"))).toThrow(/permissions you do not have/);
    expect(() => assertCanGrant(admin, [...ALL_PERMISSIONS])).toThrow();
    expect(permissionsBeyond(admin, role("Owner")).sort()).toEqual(["settings.manage", "staff.manage"]);
  });

  it("an Admin can still give the roles below it", () => {
    for (const name of ["Admin", "Cashier", "Accountant", "Service Tech", "Viewer"]) {
      expect(() => assertCanGrant(admin, role(name)), name).not.toThrow();
    }
  });

  it("an Owner can give any role", () => {
    for (const r of DEFAULT_ROLES) expect(() => assertCanGrant(owner, r.permissions)).not.toThrow();
  });
});

describe("who may change an Owner", () => {
  it("only an Owner changes an Owner's login", () => {
    expect(() => assertCanChangeUser(admin, { id: owner.id, roleName: "Owner" }, false)).toThrow(/Only an Owner/);
    expect(() => assertCanChangeUser(owner, { id: "owner-2", roleName: "Owner" }, true)).not.toThrow();
  });

  it("nobody but an Owner changes their own role", () => {
    expect(() => assertCanChangeUser(admin, { id: admin.id, roleName: "Admin" }, true)).toThrow(/your own role/);
    expect(() => assertCanChangeUser(admin, { id: admin.id, roleName: "Admin" }, false)).not.toThrow();
    expect(() => assertCanChangeUser(admin, { id: "cashier-1", roleName: "Cashier" }, true)).not.toThrow();
  });

  it("reads a stored permission list, and nothing from a broken one", () => {
    expect(rolePermissions({ permissions: '["sale.view"]' })).toEqual(["sale.view"]);
    expect(rolePermissions({ permissions: "not json" })).toEqual([]);
  });
});

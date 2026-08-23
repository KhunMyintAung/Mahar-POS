"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, Select, Modal, Spinner, Table, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface User {
  id: string; name: string; username: string; phone?: string; active: boolean;
  allBranches: boolean; commissionRate: string;
  role: { id: string; name: string };
  branches: { branch: { id: string; name: string } }[];
}
interface Role { id: string; name: string; description?: string; permissions: string[]; isSystem: boolean; _count: { users: number } }

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<string[]>([]);
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [showNewUser, setShowNewUser] = useNewModal();
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { branches, playEdition } = useAuth();

  const emptyUser = { name: "", username: "", password: "", roleId: "", allBranches: false, branchIds: [] as string[], commissionRate: "0", phone: "" };
  const [uform, setUform] = useState(emptyUser);
  const [rform, setRform] = useState({ name: "", description: "", permissions: [] as string[] });

  const load = useCallback(() => {
    api<User[]>("/api/v1/users").then(setUsers).catch((e) => push(e.message, "error"));
    api<{ roles: Role[]; allPermissions: string[] }>("/api/v1/roles")
      .then((d) => { setRoles(d.roles); setAllPerms(d.allPermissions); })
      .catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  async function createUser() {
    setBusy(true);
    try {
      await api("/api/v1/users", { method: "POST", body: uform });
      push("User created");
      setShowNewUser(false);
      setUform(emptyUser);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveUser() {
    if (!editUser) return;
    setBusy(true);
    try {
      await api(`/api/v1/users/${editUser.id}`, {
        method: "PATCH",
        body: {
          name: uform.name,
          phone: uform.phone || undefined,
          roleId: uform.roleId || undefined,
          allBranches: uform.allBranches,
          branchIds: uform.branchIds,
          commissionRate: uform.commissionRate,
          ...(uform.password ? { password: uform.password } : {}),
        },
      });
      push("User updated");
      setEditUser(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: User) {
    try {
      await api(`/api/v1/users/${u.id}`, { method: "PATCH", body: { active: !u.active } });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function createRole() {
    setBusy(true);
    try {
      await api("/api/v1/roles", { method: "POST", body: rform });
      push("Role created");
      setShowNewRole(false);
      setRform({ name: "", description: "", permissions: [] });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!users) return <Spinner />;

  const userForm = (isEdit: boolean) => (
    <div className="space-y-3">
      <Input label="Full name" value={uform.name} onChange={(e) => setUform({ ...uform, name: e.target.value })} />
      {!isEdit && <Input label="Username" value={uform.username} onChange={(e) => setUform({ ...uform, username: e.target.value })} />}
      <Input label={isEdit ? "New password (leave blank to keep)" : "Password (min 8 chars)"} type="password" value={uform.password} onChange={(e) => setUform({ ...uform, password: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Role" value={uform.roleId} onChange={(e) => setUform({ ...uform, roleId: e.target.value })}>
          <option value="">Select…</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        {!playEdition && <Input label="3D commission %" value={uform.commissionRate} onChange={(e) => setUform({ ...uform, commissionRate: e.target.value })} />}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={uform.allBranches} onChange={(e) => setUform({ ...uform, allBranches: e.target.checked })} />
        Access all branches
      </label>
      {!uform.allBranches && (
        <div className="space-y-1">
          <span className="text-sm font-medium">Branches</span>
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={uform.branchIds.includes(b.id)}
                onChange={(e) =>
                  setUform({
                    ...uform,
                    branchIds: e.target.checked
                      ? [...uform.branchIds, b.id]
                      : uform.branchIds.filter((x) => x !== b.id),
                  })
                }
              />
              {b.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users & Roles</h1>
        {tab === "users" ? (
          <Button onClick={() => { setUform(emptyUser); setShowNewUser(true); }}><Plus size={16} className="mr-1 inline" />New user</Button>
        ) : (
          <Button onClick={() => setShowNewRole(true)}><Plus size={16} className="mr-1 inline" />New role</Button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(["users", "roles"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        <Table headers={["Name", "Username", "Role", "Branches", "Commission", "Status", ""]}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-2.5 font-medium">{u.name}</td>
              <td className="px-3 py-2.5 text-xs">{u.username}</td>
              <td className="px-3 py-2.5">{u.role.name}</td>
              <td className="px-3 py-2.5 text-xs">{u.allBranches ? "All" : u.branches.map((b) => b.branch.name).join(", ") || "—"}</td>
              <td className="px-3 py-2.5 text-xs">{u.commissionRate}%</td>
              <td className="px-3 py-2.5">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", u.active ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800")}>
                  {u.active ? "Active" : "Disabled"}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setUform({
                      name: u.name, username: u.username, password: "", roleId: u.role.id,
                      allBranches: u.allBranches, branchIds: u.branches.map((b) => b.branch.id),
                      commissionRate: u.commissionRate, phone: u.phone ?? "",
                    });
                    setEditUser(u);
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>{u.active ? "Disable" : "Enable"}</Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {roles.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{r.name} {r.isSystem && <span className="text-xs text-gray-400">(system)</span>}</h3>
                <span className="text-xs text-gray-500">{r._count.users} user(s)</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{r.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.permissions.slice(0, 12).map((p) => (
                  <span key={p} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{p}</span>
                ))}
                {r.permissions.length > 12 && <span className="text-[10px] text-gray-400">+{r.permissions.length - 12} more</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showNewUser} onClose={() => setShowNewUser(false)} title="New user">
        {userForm(false)}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowNewUser(false)}>Cancel</Button>
          <Button onClick={createUser} disabled={busy || !uform.name || !uform.username || uform.password.length < 8 || !uform.roleId}>Create user</Button>
        </div>
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.name}`}>
        {userForm(true)}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
          <Button onClick={saveUser} disabled={busy || !uform.name}>Save changes</Button>
        </div>
      </Modal>

      <Modal open={showNewRole} onClose={() => setShowNewRole(false)} title="New custom role" wide>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Role name" value={rform.name} onChange={(e) => setRform({ ...rform, name: e.target.value })} />
            <Input label="Description" value={rform.description} onChange={(e) => setRform({ ...rform, description: e.target.value })} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Permissions ({rform.permissions.length} selected)</span>
            <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-3">
              {allPerms.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={rform.permissions.includes(p)}
                    onChange={(e) =>
                      setRform({
                        ...rform,
                        permissions: e.target.checked
                          ? [...rform.permissions, p]
                          : rform.permissions.filter((x) => x !== p),
                      })
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNewRole(false)}>Cancel</Button>
            <Button onClick={createRole} disabled={busy || !rform.name || rform.permissions.length === 0}>Create role</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

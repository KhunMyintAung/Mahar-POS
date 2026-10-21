"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Store, UserCog } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

/** A short branch code from its name, e.g. "Mahar Shwe Hlaing" → "MSH". Kept unique by a
 *  number when the shop already has that code. */
function codeFor(name: string, taken: string[]): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words.map((w) => w[0]).join("") : words[0] ?? "BR")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "BR";
  let code = base;
  for (let i = 2; taken.includes(code); i++) code = `${base}${i}`;
  return code;
}

/** Settings → Shop: the shop's branches (a chain of shops under one account) and the way
 *  in to staff accounts. */
export function BranchesCard({ usersOn, onShowUsers }: { usersOn: boolean; onShowUsers: () => Promise<void> }) {
  const { branches, refreshAuth } = useAuth();
  const { push } = useToast();
  const [form, setForm] = useState<{ name: string; phone: string; address: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!form?.name.trim()) return;
    setBusy(true);
    try {
      await api("/api/v1/branches", {
        method: "POST",
        body: {
          name: form.name.trim(),
          code: codeFor(form.name, branches.map((b) => b.code)),
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
        },
      });
      await refreshAuth();
      push("Branch added");
      setForm(null);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Branches and staff</h3>
        <p className="mt-1 text-xs text-gray-500">Run more than one shop under this account, and give each person their own login.</p>
      </div>

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
        {branches.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <Store size={16} className="shrink-0 text-blue-600" />
            <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
            <span className="font-mono text-xs text-gray-400">{b.code}</span>
          </div>
        ))}
      </div>

      {form ? (
        <div className="space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
          <Input label="Branch name" value={form.name} autoFocus placeholder="Mahar Shwe 2" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Phone" value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={add} disabled={busy || !form.name.trim()}>{busy ? "Saving…" : "Add branch"}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setForm({ name: "", phone: "", address: "" })}>
            <Plus size={16} className="mr-1 inline" />Add branch
          </Button>
          {usersOn ? (
            <Link href="/users" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <UserCog size={16} />Users & Roles
            </Link>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await onShowUsers(); } finally { setBusy(false); } }}>
              <UserCog size={16} className="mr-1 inline" />Turn on Users & Roles
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-gray-500">
        In Users &amp; Roles you add staff logins, choose their role (Admin, Cashier, Accountant, Viewer or your own), and the branches each one may use.
      </p>
    </Card>
  );
}

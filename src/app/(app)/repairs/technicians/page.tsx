"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Empty, Input, Modal, Select, Spinner, Table, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { RepairTabs } from "@/components/RepairTabs";
import { useAuth } from "@/components/AppShell";

/** Technician performance: for a month, each technician's repairs taken in, repaired, could
 *  not repair and still in work, what the repaired ones charged, the parts they used, what is
 *  left, what the technician earned, and how many days a repair took. Counted by the name on
 *  the repair. A technician sees only their own row; a manager sets each one's commission. */

interface Rule { mode: string; percent: string; amount: string }
interface Row {
  name: string; userId: string | null; takenIn: number; repaired: number; cannotRepair: number; working: number;
  charged: string; parts: string; profit: string; commission: string; avgDays: number | null; rule: Rule | null;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

const blankTech = { name: "", username: "", phone: "", password: "", branchId: "", mode: "PERCENT", percent: "", amount: "" };

/** How a technician is paid, as picked in a form: percent of profit, a fixed sum, or none. */
function CommissionFields({ form, onChange }: {
  form: { mode: string; percent: string; amount: string };
  onChange: (next: { mode?: string; percent?: string; amount?: string }) => void;
}) {
  return (
    <>
      <Select label="Pay per finished repair" value={form.mode} onChange={(e) => onChange({ mode: e.target.value })}>
        <option value="PERCENT">Percent of profit (charge less parts)</option>
        <option value="AMOUNT">Fixed amount per repair</option>
        <option value="NONE">No commission</option>
      </Select>
      {form.mode === "PERCENT" && (
        <Input label="Percent (%)" inputMode="decimal" value={form.percent} onChange={(e) => onChange({ percent: e.target.value })} placeholder="10" />
      )}
      {form.mode === "AMOUNT" && (
        <Input label="Amount per repair" inputMode="numeric" value={form.amount} onChange={(e) => onChange({ amount: e.target.value })} placeholder="5,000" />
      )}
    </>
  );
}

function ruleLabel(rule: Rule | null): string {
  if (!rule || rule.mode === "NONE") return "Not set";
  return rule.mode === "PERCENT" ? `${rule.percent}% of profit` : `${fmtMoney(rule.amount)} per repair`;
}

export default function TechniciansPage() {
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canSet, setCanSet] = useState(false);
  const [ownOnly, setOwnOnly] = useState(false);
  const [setting, setSetting] = useState<Row | null>(null);
  const [form, setForm] = useState({ mode: "PERCENT", percent: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tech, setTech] = useState(blankTech);
  const { push } = useToast();
  const { branches, defaultBranchId } = useAuth();

  const load = useCallback(() => {
    api<{ technicians: Row[]; canSetCommission: boolean; ownOnly: boolean }>(`/api/v1/repairs/technicians?month=${month}`)
      .then((d) => { setRows(d.technicians); setCanSet(d.canSetCommission); setOwnOnly(d.ownOnly); })
      .catch((e) => push(e.message, "error"));
  }, [month, push]);
  useEffect(load, [load]);

  function startSet(r: Row) {
    setSetting(r);
    setForm({
      mode: r.rule && r.rule.mode !== "NONE" ? r.rule.mode : "PERCENT",
      percent: r.rule && r.rule.percent !== "0" ? r.rule.percent : "",
      amount: r.rule && r.rule.amount !== "0" ? String(BigInt(r.rule.amount) / 100n) : "",
    });
  }

  async function saveSet() {
    if (!setting?.userId) return;
    setBusy(true);
    try {
      await api("/api/v1/repairs/technicians", {
        method: "PATCH",
        body: { userId: setting.userId, mode: form.mode, percent: form.percent || undefined, amount: form.amount.replace(/,/g, "") || undefined },
      });
      push("Commission saved");
      setSetting(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function startAdd() {
    setTech({ ...blankTech, branchId: defaultBranchId });
    setAdding(true);
  }

  async function saveAdd() {
    setBusy(true);
    try {
      await api("/api/v1/repairs/technicians", {
        method: "POST",
        body: {
          name: tech.name, username: tech.username, phone: tech.phone || undefined, password: tech.password,
          branchIds: tech.branchId ? [tech.branchId] : [],
          mode: tech.mode, percent: tech.percent || undefined, amount: tech.amount.replace(/,/g, "") || undefined,
        },
      });
      push("Technician added");
      setAdding(false);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const named = (rows ?? []).filter((r) => r.name);
  const best = named.reduce<Row | null>((b, r) => (!b || r.repaired > b.repaired ? r : b), null);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader
        title={<RepairTabs />}
        lead={
          <>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="min-h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
            {!ownOnly && best && best.repaired > 0 && (
              <span className="text-sm text-gray-600 dark:text-gray-300">
                🏆 <b className="text-gray-900 dark:text-gray-100">{best.name}</b> · <span>{`${best.repaired} repaired`}</span>
              </span>
            )}
          </>
        }
      >
        {canSet && <Button onClick={startAdd}><UserPlus size={16} className="mr-1 inline" />New technician</Button>}
      </PageHeader>

      {!rows ? <Spinner /> : rows.length === 0 ? (
        <Card><Empty message="No repairs in this month" /></Card>
      ) : (
        <Table
          headers={["Technician", "Taken in", "Repaired", "Could not repair", "In work now", "Charged", "Parts", "Profit", "Commission", "Avg days", ...(canSet ? [""] : [])]}
          rightAlign={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
        >
          {rows.map((r) => (
            <tr key={r.name || "—"} className={r.name ? "" : "text-gray-500"}>
              <td className="px-3 py-2.5 font-medium">
                {r.name ? `🔧 ${r.name}` : "No technician"}
                {canSet && r.userId && <div className="text-xs font-normal text-gray-500">{ruleLabel(r.rule)}</div>}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.takenIn}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-green-600">{r.repaired}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.cannotRepair}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.working}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.charged)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.parts)}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${BigInt(r.profit) < 0n ? "text-red-600" : ""}`}>{fmtMoney(r.profit)}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-blue-700 dark:text-blue-300">{r.userId ? fmtMoney(r.commission) : "—"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.avgDays ?? "—"}</td>
              {canSet && (
                <td className="px-3 py-2.5 text-right">
                  {r.userId && <Button size="sm" variant="secondary" onClick={() => startSet(r)}>Commission</Button>}
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-gray-500">
        Repaired, charged, parts and commission count repairs finished (Done or Delivered) in the month. In work now is today&apos;s count. Put the technician on each repair when you take it in, or with Edit.
      </p>

      <Modal open={Boolean(setting)} onClose={() => setSetting(null)} title={setting ? `Commission — ${setting.name}` : ""}>
        <div className="space-y-3">
          <CommissionFields form={form} onChange={(next) => setForm({ ...form, ...next })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSetting(null)}>Cancel</Button>
            <Button disabled={busy} onClick={saveSet}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="New technician">
        <div className="space-y-3">
          <Input label="Name" value={tech.name} onChange={(e) => setTech({ ...tech, name: e.target.value })} autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Username" value={tech.username} onChange={(e) => setTech({ ...tech, username: e.target.value.trim() })} autoComplete="off" />
            <Input label="Password" type="password" value={tech.password} onChange={(e) => setTech({ ...tech, password: e.target.value })} autoComplete="new-password" />
          </div>
          <Input label="Phone" inputMode="tel" value={tech.phone} onChange={(e) => setTech({ ...tech, phone: e.target.value })} />
          {branches.length > 1 && (
            <Select label="Branch" value={tech.branchId} onChange={(e) => setTech({ ...tech, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <CommissionFields form={tech} onChange={(next) => setTech({ ...tech, ...next })} />
          <p className="text-xs text-gray-500">They sign in with this username and password and see repairs only: no money, sales or reports.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button disabled={busy || !tech.name.trim() || tech.username.length < 3 || tech.password.length < 8} onClick={saveAdd}>
              {busy ? "Saving…" : "Add technician"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

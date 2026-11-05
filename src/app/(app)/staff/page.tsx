"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, cn, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";

interface Staff {
  id: string; name: string; phone?: string | null; position?: string | null; salary: string;
  startDate?: string | null; userId?: string | null; note?: string | null; active: boolean;
}
interface Advance { id: string; staffId: string; amount: string; date: string; walletId: string; salaryPaymentId?: string | null; note?: string | null; voidedAt?: string | null }
interface Payment {
  id: string; month: string; baseSalary: string; absentDays: string; absentDeduction: string; advanceDeduction: string;
  commission: string; bonus: string; otherDeduction: string; net: string; walletId: string; createdAt: string;
}
interface PayRow {
  staff: Staff; present: number; absent: number; half: number; leave: number; absentDays: number;
  absentDeduction: string; advance: string; commission: string; net: string; payment: Payment | null;
}
interface Wallet { id: string; name: string; currency: string; branchId?: string | null; active?: boolean }
interface UserRow { id: string; name: string; role?: { name: string } }

type Tab = "staff" | "attendance" | "advances" | "payroll";
const STATUSES = [
  { v: "PRESENT", label: "Present", cls: "bg-emerald-600 text-white" },
  { v: "ABSENT", label: "Absent", cls: "bg-red-600 text-white" },
  { v: "HALF", label: "Half day", cls: "bg-amber-500 text-white" },
  { v: "LEAVE", label: "Leave", cls: "bg-blue-600 text-white" },
] as const;

const today = () => new Date(Date.now() + 390 * 60_000).toISOString().slice(0, 10);
const minorToInput = (v: string) => (BigInt(v) / 100n).toString();
const num = (v: string) => parseFloat(v.replace(/,/g, "")) || 0;

/** Staff Management (switched on in Settings): the staff list with salaries, the day's
 *  attendance, advances paid before payday, and the month's payroll. Paying a salary or an
 *  advance is a Staff Salary expense from the wallet chosen; advances and days off come off
 *  the salary, a linked Service Tech's repair commission is added. */
export default function StaffPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const { push } = useToast();

  const loadStaff = useCallback(() => {
    api<Staff[]>("/api/v1/staff").then(setStaff).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(() => {
    loadStaff();
    api<Wallet[]>("/api/v1/wallets").then((l) => setWallets(l.filter((w) => w.currency === "MMK" && w.branchId && w.active !== false))).catch(() => {});
    api<UserRow[]>("/api/v1/users").then(setUsers).catch(() => {});
  }, [loadStaff]);

  if (!staff) return <Spinner />;
  const active = staff.filter((s) => s.active);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title="Staff Management" lead={<span className="text-sm text-gray-600 dark:text-gray-300">Staff, attendance, advances and salaries. Salaries and advances go into Income &amp; Expense as Staff Salary.</span>} />
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {([["staff", "Staff"], ["attendance", "Attendance"], ["advances", "Advances"], ["payroll", "Salary"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn("min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium", tab === k ? "bg-white text-navy-900 shadow dark:bg-gray-950 dark:text-gold-300" : "text-gray-600 dark:text-gray-300")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "staff" && <StaffTab staff={staff} users={users} reload={loadStaff} />}
      {tab === "attendance" && <AttendanceTab staff={active} />}
      {tab === "advances" && <AdvancesTab staff={staff} wallets={wallets} />}
      {tab === "payroll" && <PayrollTab wallets={wallets} />}
    </div>
  );
}

function StaffTab({ staff, users, reload }: { staff: Staff[]; users: UserRow[]; reload: () => void }) {
  const blank = { name: "", phone: "", position: "", salary: "", startDate: "", userId: "", note: "" };
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  function open(s: Staff | "new") {
    setEditing(s);
    setForm(s === "new" ? blank : {
      name: s.name, phone: s.phone ?? "", position: s.position ?? "", salary: minorToInput(s.salary),
      startDate: s.startDate ?? "", userId: s.userId ?? "", note: s.note ?? "",
    });
  }
  async function save(extra?: { active: boolean }) {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { ...form, salary: form.salary || "0", ...extra };
      if (editing === "new") await api("/api/v1/staff", { method: "POST", body });
      else await api(`/api/v1/staff/${editing.id}`, { method: "PATCH", body });
      push("Saved");
      setEditing(null);
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const total = staff.filter((s) => s.active).reduce((n, s) => n + BigInt(s.salary), 0n);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">Monthly salaries: <b className="tabular-nums">{fmtMoney(total.toString(), "MMK")}</b></span>
        <Button onClick={() => open("new")}><Plus size={16} className="mr-1 inline" />New staff</Button>
      </div>
      <Card>
        {staff.length === 0 ? <Empty message="No staff yet" /> : (
          <Table headers={["Name", "Position", "Phone", "Start date", "Salary", "Status", ""]} rightAlign={[4]}>
            {staff.map((s) => (
              <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                <td className="px-3 py-2 font-medium">{s.name}{s.userId && <span className="ml-1 text-xs text-gray-500">· {users.find((u) => u.id === s.userId)?.name ?? ""}</span>}</td>
                <td className="px-3 py-2 text-sm">{s.position ?? "—"}</td>
                <td className="px-3 py-2 text-sm">{s.phone ?? "—"}</td>
                <td className="px-3 py-2 text-sm">{s.startDate ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(s.salary)}</td>
                <td className="px-3 py-2 text-sm">{s.active ? "Active" : "Off"}</td>
                <td className="px-3 py-2"><Button size="sm" variant="secondary" onClick={() => open(s)}>Edit</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New staff" : "Edit staff"}
        footer={<>
          {editing && editing !== "new" && (
            <Button variant="ghost" disabled={busy} onClick={() => void save({ active: !editing.active })}>{editing.active ? "Switch off" : "Switch on"}</Button>
          )}
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button disabled={busy || !form.name.trim()} onClick={() => void save()}>Save</Button>
        </>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Cashier, Technician…" />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Monthly salary" inputMode="decimal" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
          <Input label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Select label="Login (for repair commission)" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
            <option value="">— None —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role ? ` (${u.role.name})` : ""}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
      </Modal>
    </>
  );
}

function AttendanceTab({ staff }: { staff: Staff[] }) {
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    api<{ staffId: string; status: string }[]>(`/api/v1/staff/attendance?date=${date}`)
      .then((rows) => { const m = Object.fromEntries(rows.map((r) => [r.staffId, r.status])); setMarks(m); setSaved(m); })
      .catch((e) => push(e.message, "error"));
  }, [date, push]);

  const changed = staff.filter((s) => (marks[s.id] ?? "") !== (saved[s.id] ?? ""));
  async function save() {
    setBusy(true);
    try {
      await api("/api/v1/staff/attendance", { method: "PUT", body: { date, entries: changed.map((s) => ({ staffId: s.id, status: marks[s.id] ?? "" })) } });
      setSaved(marks);
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44"><Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Button variant="secondary" onClick={() => setMarks(Object.fromEntries(staff.map((s) => [s.id, marks[s.id] || "PRESENT"])))}>Everyone present</Button>
        <Button className="ml-auto" disabled={busy || changed.length === 0} onClick={() => void save()}>Save{changed.length ? ` (${changed.length})` : ""}</Button>
      </div>
      {staff.length === 0 ? <Empty message="No staff yet" /> : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {staff.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-32 flex-1 font-medium">{s.name}</span>
              {STATUSES.map((st) => (
                <button key={st.v} type="button" onClick={() => setMarks({ ...marks, [s.id]: marks[s.id] === st.v ? "" : st.v })}
                  className={cn("min-h-9 rounded-lg border px-3 text-sm", marks[s.id] === st.v ? cn(st.cls, "border-transparent") : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300")}>
                  {st.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500">An absence takes a day&apos;s pay off the salary (salary ÷ days in the month), a half day half of it. Leave is paid.</p>
    </Card>
  );
}

function AdvancesTab({ staff, wallets }: { staff: Staff[]; wallets: Wallet[] }) {
  const [rows, setRows] = useState<Advance[] | null>(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ staffId: "", amount: "", walletId: "", date: today(), note: "" });
  const [voiding, setVoiding] = useState<Advance | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const load = useCallback(() => {
    api<Advance[]>("/api/v1/staff/advances").then(setRows).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? "—";
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); push(ok); setShow(false); setVoiding(null); load(); }
    catch (e) { push(e instanceof Error ? e.message : "Failed", "error"); }
    finally { setBusy(false); }
  }
  if (!rows) return <Spinner />;
  const open = rows.filter((a) => !a.voidedAt && !a.salaryPaymentId).reduce((n, a) => n + BigInt(a.amount), 0n);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">Not yet taken off a salary: <b className="tabular-nums">{fmtMoney(open.toString(), "MMK")}</b></span>
        <Button onClick={() => { setForm({ staffId: staff.find((s) => s.active)?.id ?? "", amount: "", walletId: wallets[0]?.id ?? "", date: today(), note: "" }); setShow(true); }}>
          <Plus size={16} className="mr-1 inline" />Give advance
        </Button>
      </div>
      <Card>
        {rows.length === 0 ? <Empty message="No advances" /> : (
          <Table headers={["Date", "Staff", "Amount", "Wallet", "Note", "Status", ""]} rightAlign={[2]}>
            {rows.map((a) => (
              <tr key={a.id} className={cn(a.voidedAt && "opacity-50 line-through")}>
                <td className="px-3 py-2 text-sm">{a.date}</td>
                <td className="px-3 py-2 font-medium">{name(a.staffId)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.amount)}</td>
                <td className="px-3 py-2 text-sm">{wallets.find((w) => w.id === a.walletId)?.name ?? "—"}</td>
                <td className="px-3 py-2 text-sm">{a.note ?? ""}</td>
                <td className="px-3 py-2 text-sm">{a.voidedAt ? "Cancelled" : a.salaryPaymentId ? "Taken off salary" : "Open"}</td>
                <td className="px-3 py-2">{!a.voidedAt && !a.salaryPaymentId && <Button size="sm" variant="ghost" onClick={() => setVoiding(a)}>Cancel</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={show} onClose={() => setShow(false)} title="Give advance"
        footer={<>
          <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
          <Button disabled={busy || !form.staffId || !form.walletId || num(form.amount) <= 0}
            onClick={() => void run(() => api("/api/v1/staff/advances", { method: "POST", body: form }), "Advance recorded")}>Save</Button>
        </>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Staff" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
            {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Select label="Paid from" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="sm:col-span-2"><Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
      </Modal>
      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="Cancel advance"
        footer={<>
          <Button variant="secondary" onClick={() => setVoiding(null)}>Close</Button>
          <Button variant="danger" disabled={busy} onClick={() => voiding && void run(() => api(`/api/v1/staff/advances/${voiding.id}/void`, { method: "POST", body: { reason: "Advance cancelled" } }), "Cancelled")}>Cancel advance</Button>
        </>}>
        <p className="text-sm">{voiding && `${name(voiding.staffId)} · ${fmtMoney(voiding.amount, "MMK")}`}</p>
        <p className="mt-1 text-xs text-gray-500">The money goes back into its wallet.</p>
      </Modal>
    </>
  );
}

function PayrollTab({ wallets }: { wallets: Wallet[] }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [rows, setRows] = useState<PayRow[] | null>(null);
  const [paying, setPaying] = useState<PayRow | null>(null);
  const [form, setForm] = useState({ walletId: "", commission: "", bonus: "", otherDeduction: "", absentDays: "", note: "" });
  const [voiding, setVoiding] = useState<PayRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const load = useCallback(() => {
    api<{ rows: PayRow[] }>(`/api/v1/staff/payroll?month=${month}`).then((d) => setRows(d.rows)).catch((e) => push(e.message, "error"));
  }, [month, push]);
  useEffect(load, [load]);

  function open(r: PayRow) {
    setPaying(r);
    setForm({ walletId: wallets[0]?.id ?? "", commission: minorToInput(r.commission), bonus: "", otherDeduction: "", absentDays: String(r.absentDays), note: "" });
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); push(ok); setPaying(null); setVoiding(null); load(); }
    catch (e) { push(e instanceof Error ? e.message : "Failed", "error"); }
    finally { setBusy(false); }
  }

  // The amount to pay as typed: salary less days off (salary ÷ days in month each), less
  // advances, plus commission and bonus, less other deductions; the server works it out again.
  const preview = useMemo(() => {
    if (!paying) return 0;
    const [y, m] = month.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const salary = Number(BigInt(paying.staff.salary) / 100n);
    const off = Math.round((salary * num(form.absentDays)) / days / 1) || 0;
    return salary - off - Number(BigInt(paying.advance) / 100n) + num(form.commission) + num(form.bonus) - num(form.otherDeduction);
  }, [paying, form, month]);

  const totals = (rows ?? []).reduce((t, r) => ({
    due: t.due + (r.payment ? 0n : BigInt(r.net)),
    paid: t.paid + (r.payment ? BigInt(r.payment.net) : 0n),
  }), { due: 0n, paid: 0n });

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44"><Input label="Month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <StatCard label="Still to pay" value={fmtMoney(totals.due.toString(), "MMK")} tone="amber" />
        <StatCard label="Paid this month" value={fmtMoney(totals.paid.toString(), "MMK")} tone="green" />
      </div>
      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty message="No staff yet" /> : (
          <Table headers={["Staff", "Salary", "Days off", "Advance", "Commission", "To pay", "Status", ""]} rightAlign={[1, 2, 3, 4, 5]}>
            {rows.map((r) => (
              <tr key={r.staff.id}>
                <td className="px-3 py-2 font-medium">{r.staff.name}
                  <div className="text-xs font-normal text-gray-500">{`P ${r.present} · A ${r.absent} · H ${r.half} · L ${r.leave}`}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.payment?.baseSalary ?? r.staff.salary)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.payment ? r.payment.absentDays : r.absentDays}{BigInt(r.payment?.absentDeduction ?? r.absentDeduction) > 0n && <div className="text-xs text-red-600">-{fmtMoney(r.payment?.absentDeduction ?? r.absentDeduction)}</div>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.payment?.advanceDeduction ?? r.advance)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.payment?.commission ?? r.commission)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.payment?.net ?? r.net)}</td>
                <td className="px-3 py-2 text-sm">{r.payment ? <span className="text-emerald-700 dark:text-emerald-400">Paid</span> : "Not paid"}</td>
                <td className="px-3 py-2">
                  {r.payment
                    ? <Button size="sm" variant="ghost" onClick={() => setVoiding(r)}>Cancel</Button>
                    : r.staff.active && <Button size="sm" onClick={() => open(r)}>Pay</Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={paying ? `Pay salary · ${paying.staff.name} · ${month}` : "Pay salary"}
        footer={<>
          <Button variant="secondary" onClick={() => setPaying(null)}>Cancel</Button>
          <Button disabled={busy || !form.walletId || preview < 0} onClick={() => paying && void run(() => api("/api/v1/staff/payroll", {
            method: "POST",
            body: {
              staffId: paying.staff.id, month, walletId: form.walletId, commission: form.commission || "0", bonus: form.bonus || "0",
              otherDeduction: form.otherDeduction || "0", absentDays: num(form.absentDays), note: form.note || undefined,
            },
          }), "Salary paid")}>Pay</Button>
        </>}>
        {paying && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span>Salary</span><span className="text-right tabular-nums">{fmtMoney(paying.staff.salary)}</span>
              <span>Advances to take off</span><span className="text-right tabular-nums">-{fmtMoney(paying.advance)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Days off (unpaid)" inputMode="decimal" value={form.absentDays} onChange={(e) => setForm({ ...form, absentDays: e.target.value })} />
              <Input label="Commission" inputMode="decimal" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} />
              <Input label="Bonus" inputMode="decimal" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
              <Input label="Other deduction" inputMode="decimal" value={form.otherDeduction} onChange={(e) => setForm({ ...form, otherDeduction: e.target.value })} />
              <Select label="Paid from" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
              <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="flex justify-between rounded-lg bg-gray-50 p-2 text-sm font-semibold dark:bg-gray-800">
              <span>To pay</span><span className={cn("tabular-nums", preview < 0 && "text-red-600")}>{Math.round(preview).toLocaleString("en-US")} MMK</span>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="Cancel salary"
        footer={<>
          <Button variant="secondary" onClick={() => setVoiding(null)}>Close</Button>
          <Button variant="danger" disabled={busy} onClick={() => voiding?.payment && void run(() => api(`/api/v1/staff/payroll/${voiding.payment!.id}/void`, { method: "POST", body: { reason: "Salary cancelled" } }), "Cancelled")}>Cancel salary</Button>
        </>}>
        <p className="text-sm">{voiding?.payment && `${voiding.staff.name} · ${month} · ${fmtMoney(voiding.payment.net, "MMK")}`}</p>
        <p className="mt-1 text-xs text-gray-500">The money goes back into its wallet and the advances taken off are open again.</p>
      </Modal>
    </>
  );
}

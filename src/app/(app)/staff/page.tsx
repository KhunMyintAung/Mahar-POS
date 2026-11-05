"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, cn, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/components/AppShell";

interface Staff {
  id: string; name: string; phone?: string | null; position?: string | null; salary: string;
  attendanceBonus: string; deposit: string;
  startDate?: string | null; userId?: string | null; note?: string | null; active: boolean;
}
interface Advance { id: string; staffId: string; amount: string; date: string; walletId: string; salaryPaymentId?: string | null; note?: string | null; voidedAt?: string | null }
interface Payment {
  id: string; month: string; baseSalary: string; absentDays: string; absentDeduction: string; advanceDeduction: string;
  commission: string; bonus: string; otherDeduction: string; net: string; walletId: string; createdAt: string;
  attendanceBonus: string; deposit: string;
}
interface PayRow {
  staff: Staff; present: number; absent: number; half: number; leave: number; absentDays: number;
  absentDeduction: string; advance: string; commission: string; net: string; payment: Payment | null;
  attendanceBonus: string; deposit: string;
}
interface Bonus { id: string; staffId: string; amount: string; date: string; walletId: string; note?: string | null; voidedAt?: string | null }
interface DepositBal { staffId: string; kept: string; returned: string; held: string; months: number; firstMonth: string | null }
interface DepositReturn { id: string; staffId: string; amount: string; date: string; walletId: string; note?: string | null; voidedAt?: string | null }
interface EarnCell { salary: string; commission: string; bonus: string; total: string }
interface EarnRow { staff: { id: string; name: string; active: boolean }; months: Record<string, EarnCell>; year: EarnCell; allTime: EarnCell; depositHeld: string; depositMonths: number }
interface BossShare { year: string; partners: { name: string; percent: number; total: string }[]; months: { month: string; netProfit: string; reserve: string; shares: string[] }[] }
interface Wallet { id: string; name: string; currency: string; branchId?: string | null; active?: boolean }
interface UserRow { id: string; name: string; role?: { name: string } }

type Tab = "staff" | "attendance" | "advances" | "payroll" | "bonus" | "earnings" | "boss";
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
  const { hasPerm } = useAuth();

  const loadStaff = useCallback(() => {
    api<Staff[]>("/api/v1/staff").then(setStaff).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(() => {
    loadStaff();
    api<Wallet[]>("/api/v1/staff/wallets").then(setWallets).catch(() => {});
    api<UserRow[]>("/api/v1/staff/from-users?all=1").then(setUsers).catch(() => {});
  }, [loadStaff]);

  if (!staff) return <Spinner />;
  const active = staff.filter((s) => s.active);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title="Staff Management" lead={<span className="text-sm text-gray-600 dark:text-gray-300">Staff, attendance, advances and salaries. Salaries and advances go into Income &amp; Expense as Staff Salary.</span>} />
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {([["staff", "Staff"], ["attendance", "Attendance"], ["advances", "Advances"], ["payroll", "Salary"], ["bonus", "Bonus & Deposit"], ["earnings", "Earnings"],
          // Boss Share shows the shop's profit: only for someone who can see Reports (the owner, not HR).
          ...(hasPerm("report.view") ? [["boss", "Boss Share"]] : [])] as [Tab, string][]).map(([k, label]) => (
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
      {tab === "bonus" && <BonusTab staff={staff} wallets={wallets} />}
      {tab === "earnings" && <EarningsTab />}
      {tab === "boss" && <BossTab />}
    </div>
  );
}

function StaffTab({ staff, users, reload }: { staff: Staff[]; users: UserRow[]; reload: () => void }) {
  const blank = { name: "", phone: "", position: "", salary: "", attendanceBonus: "", deposit: "", startDate: "", userId: "", note: "" };
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  // Users from Users & Roles not yet on this list, so they need not be typed in again.
  const [fromUsers, setFromUsers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api<{ id: string; name: string }[]>("/api/v1/staff/from-users").then(setFromUsers).catch(() => {});
  }, [staff]);
  async function addUsers() {
    setBusy(true);
    try {
      const r = await api<{ added: number }>("/api/v1/staff/from-users", { method: "POST" });
      push(`${r.added} added`);
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function open(s: Staff | "new") {
    setEditing(s);
    setForm(s === "new" ? blank : {
      name: s.name, phone: s.phone ?? "", position: s.position ?? "", salary: minorToInput(s.salary),
      attendanceBonus: minorToInput(s.attendanceBonus ?? "0"), deposit: minorToInput(s.deposit ?? "0"),
      startDate: s.startDate ?? "", userId: s.userId ?? "", note: s.note ?? "",
    });
  }
  async function save(extra?: { active: boolean }) {
    if (!editing) return;
    setBusy(true);
    try {
      const body = { ...form, salary: form.salary || "0", attendanceBonus: form.attendanceBonus || "0", deposit: form.deposit || "0", ...extra };
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
      {fromUsers.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="min-w-0 flex-1 text-sm">
            {`From Users & Roles, not on this list yet: ${fromUsers.map((u) => u.name).join(", ")}`}
          </span>
          <Button disabled={busy} onClick={() => void addUsers()}>{`Add them (${fromUsers.length})`}</Button>
        </Card>
      )}
      <Card>
        {staff.length === 0 ? <Empty message="No staff yet" /> : (
          <Table headers={["Name", "Position", "Phone", "Start date", "Salary", "Status", ""]} rightAlign={[4]}>
            {staff.map((s) => (
              <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                <td className="px-3 py-2 font-medium">{s.name}{(() => {
                  // The login's name only when it differs from the staff name.
                  const login = s.userId ? users.find((u) => u.id === s.userId)?.name : undefined;
                  return login && login !== s.name ? <span className="ml-1 text-xs text-gray-500">{`· ${login}`}</span> : null;
                })()}</td>
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
          <Input label="No days off bonus (monthly)" inputMode="decimal" placeholder="20000" value={form.attendanceBonus} onChange={(e) => setForm({ ...form, attendanceBonus: e.target.value })} />
          <Input label="Deposit kept from salary (monthly)" inputMode="decimal" placeholder="10000" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
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
  const [form, setForm] = useState({ walletId: "", commission: "", bonus: "", attendanceBonus: "", deposit: "", otherDeduction: "", absentDays: "", note: "" });
  const [voiding, setVoiding] = useState<PayRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const load = useCallback(() => {
    api<{ rows: PayRow[] }>(`/api/v1/staff/payroll?month=${month}`).then((d) => setRows(d.rows)).catch((e) => push(e.message, "error"));
  }, [month, push]);
  useEffect(load, [load]);

  function open(r: PayRow) {
    setPaying(r);
    setForm({
      walletId: wallets[0]?.id ?? "", commission: minorToInput(r.commission), bonus: "", attendanceBonus: minorToInput(r.attendanceBonus ?? "0"),
      deposit: minorToInput(r.deposit ?? "0"), otherDeduction: "", absentDays: String(r.absentDays), note: "",
    });
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
    return salary - off - Number(BigInt(paying.advance) / 100n) + num(form.commission) + num(form.bonus) + num(form.attendanceBonus) - num(form.otherDeduction) - num(form.deposit);
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
              attendanceBonus: form.attendanceBonus || "0", deposit: form.deposit || "0",
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
              <Input label="No days off bonus" inputMode="decimal" value={form.attendanceBonus} onChange={(e) => setForm({ ...form, attendanceBonus: e.target.value })} />
              <Input label="Deposit kept" inputMode="decimal" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
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

/** Bonuses paid on their own (year end, Thingyan…), and the deposit kept from salaries:
 *  what each person has held, and paying it back once ${months} months were kept. */
function BonusTab({ staff, wallets }: { staff: Staff[]; wallets: Wallet[] }) {
  const [bonuses, setBonuses] = useState<Bonus[] | null>(null);
  const [dep, setDep] = useState<{ months: number; balances: DepositBal[]; returns: DepositReturn[] } | null>(null);
  const [form, setForm] = useState<{ kind: "bonus" | "deposit"; staffId: string; amount: string; walletId: string; date: string; note: string; early: boolean } | null>(null);
  const [voiding, setVoiding] = useState<{ kind: "bonus" | "deposit"; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const load = useCallback(() => {
    api<Bonus[]>("/api/v1/staff/bonuses").then(setBonuses).catch((e) => push(e.message, "error"));
    api<{ months: number; balances: DepositBal[]; returns: DepositReturn[] }>("/api/v1/staff/deposits").then(setDep).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? "—";
  const wallet = (id: string) => wallets.find((w) => w.id === id)?.name ?? "—";
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); push(ok); setForm(null); setVoiding(null); load(); }
    catch (e) { push(e instanceof Error ? e.message : "Failed", "error"); }
    finally { setBusy(false); }
  }
  if (!bonuses || !dep) return <Spinner />;
  const bal = (id: string) => dep.balances.find((b) => b.staffId === id);
  const held = dep.balances.reduce((n, b) => n + BigInt(b.held), 0n);
  const picked = form ? bal(form.staffId) : undefined;
  const tooEarly = form?.kind === "deposit" && (picked?.months ?? 0) < dep.months;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <StatCard label="Bonuses this year" value={fmtMoney(bonuses.filter((b) => !b.voidedAt && b.date.startsWith(today().slice(0, 4))).reduce((n, b) => n + BigInt(b.amount), 0n).toString(), "MMK")} tone="green" />
        <StatCard label="Deposit held for staff" value={fmtMoney(held.toString(), "MMK")} tone="amber" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Bonuses</h3>
        <Button onClick={() => setForm({ kind: "bonus", staffId: staff.find((s) => s.active)?.id ?? "", amount: "", walletId: wallets[0]?.id ?? "", date: today(), note: "", early: false })}>
          <Plus size={16} className="mr-1 inline" />Give bonus
        </Button>
      </div>
      <Card>
        {bonuses.length === 0 ? <Empty message="No bonuses yet" /> : (
          <Table headers={["Date", "Staff", "Amount", "Wallet", "Note", ""]} rightAlign={[2]}>
            {bonuses.map((b) => (
              <tr key={b.id} className={cn(b.voidedAt && "opacity-50 line-through")}>
                <td className="px-3 py-2 text-sm">{b.date}</td>
                <td className="px-3 py-2 font-medium">{name(b.staffId)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.amount)}</td>
                <td className="px-3 py-2 text-sm">{wallet(b.walletId)}</td>
                <td className="px-3 py-2 text-sm">{b.note ?? ""}</td>
                <td className="px-3 py-2">{!b.voidedAt && <Button size="sm" variant="ghost" onClick={() => setVoiding({ kind: "bonus", id: b.id, label: `${name(b.staffId)} · ${fmtMoney(b.amount, "MMK")}` })}>Cancel</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <h3 className="pt-2 text-sm font-semibold">Deposit</h3>
      <Card>
        {dep.balances.length === 0 ? <Empty message="No deposit kept yet. Set the monthly deposit on a staff member, then it is kept from each salary." /> : (
          <Table headers={["Staff", "Months", "Kept", "Paid back", "Held", ""]} rightAlign={[1, 2, 3, 4]}>
            {dep.balances.map((b) => (
              <tr key={b.staffId}>
                <td className="px-3 py-2 font-medium">{name(b.staffId)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.months}{b.months < dep.months && <div className="text-xs text-gray-500">{`${dep.months - b.months} more to go`}</div>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.kept)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.returned)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(b.held)}</td>
                <td className="px-3 py-2">{BigInt(b.held) > 0n && (
                  <Button size="sm" variant={b.months >= dep.months ? "primary" : "secondary"}
                    onClick={() => setForm({ kind: "deposit", staffId: b.staffId, amount: minorToInput(b.held), walletId: wallets[0]?.id ?? "", date: today(), note: "", early: false })}>Pay back</Button>
                )}</td>
              </tr>
            ))}
          </Table>
        )}
        {dep.returns.length > 0 && (
          <div className="border-t border-gray-100 p-3 text-sm dark:border-gray-800">
            <div className="mb-1 text-xs font-semibold text-gray-500">Paid back</div>
            {dep.returns.map((r) => (
              <div key={r.id} className={cn("flex items-center justify-between gap-2 py-0.5", r.voidedAt && "opacity-50 line-through")}>
                <span>{`${r.date} · ${name(r.staffId)} · ${wallet(r.walletId)}`}</span>
                <span className="flex items-center gap-2 tabular-nums">{fmtMoney(r.amount)}
                  {!r.voidedAt && <Button size="sm" variant="ghost" onClick={() => setVoiding({ kind: "deposit", id: r.id, label: `${name(r.staffId)} · ${fmtMoney(r.amount, "MMK")}` })}>Cancel</Button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="text-xs text-gray-500">{`The deposit is kept from each salary and can be paid back after ${dep.months} months. Bonuses and paybacks go into Income & Expense as Staff Salary.`}</p>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.kind === "deposit" ? "Pay back deposit" : "Give bonus"}
        footer={<>
          <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
          <Button disabled={busy || !form?.staffId || !form?.walletId || num(form?.amount ?? "") <= 0 || (tooEarly && !form?.early)}
            onClick={() => form && void run(() => api(form.kind === "deposit" ? "/api/v1/staff/deposits" : "/api/v1/staff/bonuses", {
              method: "POST",
              body: { staffId: form.staffId, amount: form.amount, walletId: form.walletId, date: form.date, note: form.note || undefined, ...(form.kind === "deposit" ? { early: form.early } : {}) },
            }), "Saved")}>Save</Button>
        </>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Staff" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} disabled={form.kind === "deposit"}>
              {staff.filter((s) => s.active || s.id === form.staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Select label="Paid from" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <div className="sm:col-span-2"><Input label="Note" placeholder={form.kind === "bonus" ? "Year end, Thingyan…" : ""} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            {form.kind === "deposit" && picked && (
              <p className="text-sm sm:col-span-2">{`Held ${fmtMoney(picked.held, "MMK")} · ${picked.months} of ${dep.months} months kept`}</p>
            )}
            {tooEarly && (
              <label className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300 sm:col-span-2">
                <input type="checkbox" checked={form.early} onChange={(e) => setForm({ ...form, early: e.target.checked })} />
                {`Pay back before ${dep.months} months (leaving the job…)`}
              </label>
            )}
          </div>
        )}
      </Modal>
      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="Cancel"
        footer={<>
          <Button variant="secondary" onClick={() => setVoiding(null)}>Close</Button>
          <Button variant="danger" disabled={busy} onClick={() => voiding && void run(() => api(`/api/v1/staff/${voiding.kind === "bonus" ? "bonuses" : "deposits"}/${voiding.id}/void`, { method: "POST", body: { reason: "Cancelled" } }), "Cancelled")}>Cancel it</Button>
        </>}>
        <p className="text-sm">{voiding?.label}</p>
        <p className="mt-1 text-xs text-gray-500">The money goes back into its wallet.</p>
      </Modal>
    </>
  );
}

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });
const yearOptions = () => { const y = Number(today().slice(0, 4)); return [y, y - 1, y - 2, y - 3]; };

/** What each person has earned: month by month for a year, the year, and all time. */
function EarningsTab() {
  const [year, setYear] = useState(today().slice(0, 4));
  const [data, setData] = useState<{ months: string[]; rows: EarnRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { push } = useToast();
  useEffect(() => {
    api<{ months: string[]; rows: EarnRow[] }>(`/api/v1/staff/earnings?year=${year}`).then(setData).catch((e) => push(e.message, "error"));
  }, [year, push]);
  if (!data) return <Spinner />;
  const sum = (pick: (r: EarnRow) => string) => data.rows.reduce((n, r) => n + BigInt(pick(r)), 0n).toString();

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32"><Select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
          {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </Select></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label={`Paid to staff in ${year}`} value={fmtMoney(sum((r) => r.year.total), "MMK")} />
        <StatCard label="Paid to staff, all time" value={fmtMoney(sum((r) => r.allTime.total), "MMK")} />
        <StatCard label="Deposit held for staff" value={fmtMoney(sum((r) => r.depositHeld), "MMK")} tone="amber" />
      </div>
      <Card>
        {data.rows.length === 0 ? <Empty message="Nothing paid yet" /> : (
          <Table grid headers={["Staff", "Salary", "Commission", "Bonus", `Total ${year}`, "All time", "Deposit held"]} rightAlign={[1, 2, 3, 4, 5, 6]} csv={`staff-earnings-${year}`}>
            {data.rows.map((r) => (
              <tr key={r.staff.id} className={cn("cursor-pointer", !r.staff.active && "opacity-60")} onClick={() => setOpen(open === r.staff.id ? null : r.staff.id)}>
                <td className="px-3 py-2 font-medium">{r.staff.name} <span className="text-xs text-gray-400">{open === r.staff.id ? "▴" : "▾"}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.year.salary)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.year.commission)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.year.bonus)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.year.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.allTime.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.depositHeld)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold dark:bg-gray-800/60">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum((r) => r.year.salary))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum((r) => r.year.commission))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum((r) => r.year.bonus))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum((r) => r.year.total))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum((r) => r.allTime.total))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(sum((r) => r.depositHeld))}</td>
            </tr>
          </Table>
        )}
      </Card>
      {open && (() => {
        const r = data.rows.find((x) => x.staff.id === open);
        if (!r) return null;
        return (
          <Card>
            <div className="px-3 pt-3 text-sm font-semibold">{`${r.staff.name} · ${year} by month`}</div>
            <Table grid headers={["Month", "Salary", "Commission", "Bonus", "Total"]} rightAlign={[1, 2, 3, 4]} csv={`earnings-${r.staff.name}-${year}`}>
              {data.months.map((m) => (
                <tr key={m} className={cn(BigInt(r.months[m].total) === 0n && "text-gray-400")}>
                  <td className="px-3 py-1.5">{monthName(m)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(r.months[m].salary)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(r.months[m].commission)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(r.months[m].bonus)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtMoney(r.months[m].total)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        );
      })()}
      <p className="text-xs text-gray-500">Salary is after days off and deductions, with the deposit counted (it is theirs). Bonus includes the no days off bonus and bonuses paid on their own. Tap a name for each month.</p>
    </>
  );
}

/** Boss Share: each month's net profit split among the partners set in Reports. */
function BossTab() {
  const [year, setYear] = useState(today().slice(0, 4));
  const [data, setData] = useState<BossShare | null>(null);
  const [editing, setEditing] = useState<{ name: string; percent: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const load = useCallback(() => {
    api<BossShare>(`/api/v1/staff/boss-share?year=${year}`).then(setData).catch((e) => push(e.message, "error"));
  }, [year, push]);
  useEffect(load, [load]);
  // Partners are the Reports' profit sharing setting, edited here too, so the owner need not leave Staff.
  async function savePartners() {
    if (!editing) return;
    setBusy(true);
    try {
      const current = await api<Record<string, unknown>>("/api/v1/reports/settings");
      const partners = editing.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), percent: num(p.percent) }));
      await api("/api/v1/reports/settings", { method: "PUT", body: { ...current, partners } });
      push("Saved");
      setEditing(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const editTotal = (editing ?? []).filter((p) => p.name.trim()).reduce((n, p) => n + num(p.percent), 0);
  if (!data) return <Spinner />;
  const profit = data.months.reduce((n, m) => n + BigInt(m.netProfit), 0n).toString();

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32"><Select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
          {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </Select></div>
        {hasPerm("settings.manage") && (
          <Button variant="secondary" className="ml-auto" onClick={() => setEditing(data.partners.length ? data.partners.map((p) => ({ name: p.name, percent: String(p.percent) })) : [{ name: "Boss", percent: "100" }])}>
            Boss &amp; partners
          </Button>
        )}
      </div>
      {data.partners.length === 0 ? (
        <Card className="p-4 text-sm">No boss or partners set yet. Tap Boss &amp; partners to add them with their %, then each one&apos;s share shows here.</Card>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard label={`Net profit ${year}`} value={fmtMoney(profit, "MMK")} tone={BigInt(profit) < 0n ? "red" : "green"} />
            {data.partners.map((p) => (
              <StatCard key={p.name} label={`${p.name} · ${p.percent}%`} value={fmtMoney(p.total, "MMK")} tone="blue" />
            ))}
          </div>
          <Card>
            <Table grid headers={["Month", "Net profit", "Kept as capital", ...data.partners.map((p) => p.name)]} rightAlign={[1, 2, ...data.partners.map((_, i) => i + 3)]} csv={`boss-share-${year}`}>
              {data.months.map((m) => (
                <tr key={m.month}>
                  <td className="px-3 py-1.5">{monthName(m.month)}</td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", BigInt(m.netProfit) < 0n && "text-red-700/85 dark:text-red-300/80")}>{fmtMoney(m.netProfit)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(m.reserve)}</td>
                  {m.shares.map((v, i) => <td key={i} className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtMoney(v)}</td>)}
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold dark:bg-gray-800/60">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(profit)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(data.months.reduce((n, m) => n + BigInt(m.reserve), 0n).toString())}</td>
                {data.partners.map((p) => <td key={p.name} className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(p.total)}</td>)}
              </tr>
            </Table>
          </Card>
          <p className="text-xs text-gray-500">Net profit is the Reports figure (after expenses and staff salary). A month with a loss shares nothing.</p>
        </>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Boss & partners"
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button disabled={busy || (editTotal !== 0 && Math.abs(editTotal - 100) > 0.01)} onClick={() => void savePartners()}>Save</Button>
        </>}>
        {editing && (
          <div className="space-y-2">
            {editing.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1"><Input label={i === 0 ? "Name" : ""} value={p.name} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></div>
                <div className="w-24"><Input label={i === 0 ? "%" : ""} inputMode="decimal" value={p.percent} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} /></div>
                <Button variant="ghost" aria-label="Remove" title="Remove" onClick={() => setEditing(editing.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            {editing.length < 10 && <Button variant="ghost" onClick={() => setEditing([...editing, { name: "", percent: "" }])}>+ Add partner</Button>}
            <p className={cn("text-sm", editTotal !== 0 && Math.abs(editTotal - 100) > 0.01 ? "text-red-600" : "text-gray-500")}>
              {`Total ${editTotal}% — must be 100%, or all 0 for equal shares`}
            </p>
            <p className="text-xs text-gray-500">The same setting as profit sharing in Reports. Capital kept for next month is set there.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

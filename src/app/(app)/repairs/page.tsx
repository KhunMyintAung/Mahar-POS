"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Clock3, History, PackageCheck, Plus, Printer, Search, Wrench } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Empty, Input, Modal, Select, Spinner, Table, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { RepairVoucher, RepairVoucherSlip, type RepairVoucherData } from "@/components/RepairVoucher";
import { printReceipt } from "@/lib/printReceipt";
import type { RepairVoucherSettings } from "@/lib/repairVoucherSettings";
import { splitBrandModel } from "@/lib/deviceName";
import { PRIORITIES, REPAIR_STATUSES, REPAIR_STATUS_LABELS, nextStatuses, type RepairStatus } from "@/lib/repairStatus";

interface Job {
  id: string; jobNo: string; status: string; priority: string;
  customerName?: string; customerPhone?: string;
  deviceBrand: string; deviceModel: string; imei?: string;
  accessories?: string; problem: string; intakeCondition?: string; notes?: string;
  estimatedCost: string; partsCost: string; finalCost: string;
  depositAmount: string; paidAmount: string;
  receivedAt: string; deliveredAt?: string; promisedAt?: string | null;
  trackToken?: string | null; receivedByName?: string;
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Summary { total: number; inWorkflow: number; completed: number; delivered: number; month: string }
interface Suggestions { brands: string[]; pairs: { brand: string; model: string }[] }

const STATUS_TONE: Record<string, string> = {
  RECEIVED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  CHECKING: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  WAITING_PARTS: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  CANNOT_REPAIR: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  DELIVERED: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const PRIORITY_TONE: Record<string, string> = {
  HIGH: "text-orange-600",
  URGENT: "font-bold text-red-600",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[status] ?? STATUS_TONE.CANCELLED)}>
      {REPAIR_STATUS_LABELS[status as RepairStatus] ?? status}
    </span>
  );
}

/** A charge is set and all of it has been taken. */
const settled = (job: Pick<Job, "finalCost" | "paidAmount">) =>
  Number(job.finalCost) > 0 && Number(job.paidAmount) >= Number(job.finalCost);

/** The status pill, which opens a small list of the moves allowed from here.
 *
 *  Not a native select: browsers draw their own arrow and text on one, which came out large
 *  and doubled on some phones. The list is fixed-positioned so the table's sideways scroll
 *  does not clip it. */
function StatusMenu({ status, options, disabled, onPick }: {
  status: string; options: RepairStatus[]; disabled?: boolean; onPick: (s: RepairStatus) => void;
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  return (
    <>
      <button
        type="button"
        title="Change status"
        disabled={disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 176) });
        }}
        className={cn(
          "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-1.5 text-xs font-medium disabled:opacity-60",
          STATUS_TONE[status] ?? STATUS_TONE.CANCELLED,
        )}
      >
        {REPAIR_STATUS_LABELS[status as RepairStatus] ?? status}
        <ChevronDown size={11} className="opacity-60" />
      </button>
      {at && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAt(null)} />
          <div
            role="menu"
            className="fixed z-50 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            style={{ top: at.top, left: at.left }}
          >
            {options.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => { setAt(null); onPick(s); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_TONE[s]?.split(" ")[0])} />
                {REPAIR_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const blankForm = {
  customerName: "", customerPhone: "",
  deviceBrand: "", deviceModel: "", imei: "",
  accessories: "", problem: "", intakeCondition: "", priority: "NORMAL",
  estimatedCost: "", depositAmount: "", depositWalletId: "",
  promisedAt: "", notes: "",
};

export default function RepairsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [summary, setSummary] = useState<Summary>({ total: 0, inWorkflow: 0, completed: 0, delivered: 0, month: "" });
  // Empty means "this month", which the server works out in the shop's own timezone.
  const [month, setMonth] = useState("");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [showOptional, setShowOptional] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestions>({ brands: [], pairs: [] });
  const [busy, setBusy] = useState(false);
  const [quickSaving, setQuickSaving] = useState<string | null>(null);
  const [working, setWorking] = useState<Job | null>(null);
  const [move, setMove] = useState({ status: "", finalCost: "", partsCost: "", walletId: "", notes: "" });
  const [form, setForm] = useState(blankForm);
  const [paying, setPaying] = useState<Job | null>(null);
  const [pay, setPay] = useState({ finalCost: "", walletId: "" });
  const [editing, setEditing] = useState<Job | null>(null);
  const [edit, setEdit] = useState(blankForm);
  const [voucher, setVoucher] = useState<RepairVoucherData | null>(null);
  const [voucherText, setVoucherText] = useState<Pick<RepairVoucherSettings, "tagline" | "terms" | "qrCaption"> | null>(null);
  const [historyImei, setHistoryImei] = useState("");
  const [history, setHistory] = useState<{ imei: string; jobs: Job[] } | null>(null);
  const { push } = useToast();
  const { hasPerm, defaultBranchId, me } = useAuth();

  function openVoucher(job: Job) {
    setVoucher({
      jobNo: job.jobNo,
      at: job.receivedAt,
      shopName: me?.business?.name ?? "Mahar Mini POS",
      shopLogo: me?.business?.logoUrl ?? undefined,
      shopPhone: me?.business?.phone ?? undefined,
      shopAddress: me?.business?.address ?? undefined,
      customerName: job.customerName ?? undefined,
      customerPhone: job.customerPhone ?? undefined,
      deviceBrand: job.deviceBrand,
      deviceModel: job.deviceModel,
      imei: job.imei ?? undefined,
      accessories: job.accessories ?? undefined,
      problem: job.problem,
      status: job.status,
      estimatedCost: Number(job.estimatedCost) / 100,
      finalCost: Number(job.finalCost) / 100,
      paidAmount: Number(job.paidAmount) / 100,
      receivedByName: job.receivedByName,
      // Built from wherever the app is being used, so the QR follows the shop's own domain.
      trackUrl: job.trackToken ? `${window.location.origin}/track/${job.trackToken}` : undefined,
      ...(voucherText ?? {}),
    });
  }

  useEffect(() => {
    api<RepairVoucherSettings>("/api/v1/settings/repair-voucher")
      .then(({ tagline, terms, qrCaption }) => setVoucherText({ tagline, terms, qrCaption }))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (month) params.set("month", month);
    api<{ jobs: Job[]; summary: Summary }>(`/api/v1/repairs?${params}`)
      .then((d) => { setJobs(d.jobs); setSummary(d.summary); })
      .catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push, q, status, month]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!(showNew && hasPerm("repair.create")) && !editing) return;
    api<Suggestions>("/api/v1/repairs/device-suggestions").then(setSuggestions).catch(() => {});
  }, [showNew, editing, hasPerm]);

  /** Models seen with the brand being typed come first; the rest follow. */
  const modelSuggestions = useMemo(() => {
    const brand = (editing ? edit.deviceBrand : form.deviceBrand).trim().toLowerCase();
    const matched = suggestions.pairs.filter((p) => p.brand.trim().toLowerCase() === brand).map((p) => p.model);
    const rest = brand ? [] : suggestions.pairs.map((p) => p.model);
    return [...new Set([...matched, ...rest])].slice(0, 120);
  }, [editing, edit.deviceBrand, form.deviceBrand, suggestions]);

  async function create() {
    setBusy(true);
    try {
      const job = await api<Job>("/api/v1/repairs", {
        method: "POST",
        body: {
          ...form,
          // Sent explicitly so a multi-branch shop books the job against the branch the
          // person is actually working in.
          branchId: defaultBranchId || undefined,
          estimatedCost: form.estimatedCost || "0",
          depositAmount: form.depositAmount || "0",
          depositWalletId: form.depositWalletId || undefined,
          promisedAt: form.promisedAt || undefined,
          customerName: form.customerName || undefined,
          customerPhone: form.customerPhone || undefined,
          imei: form.imei || undefined,
          accessories: form.accessories || undefined,
          intakeCondition: form.intakeCondition || undefined,
          notes: form.notes || undefined,
        },
      });
      push("Repair job created");
      setShowNew(false);
      setShowOptional(false);
      // The customer leaves with a voucher, so it is ready to print the moment the job is saved.
      openVoucher(job);
      setForm(blankForm);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  /** Typing "iPhone 13 Pro Max" into Brand keeps "iPhone" there and moves "13 Pro Max" to
   *  Model, then puts the cursor in Model so the rest of the name lands where it belongs. */
  function onBrandTyped(value: string, model: string, set: (brand: string, model: string) => void, modelId: string) {
    const split = splitBrandModel(value, suggestions.brands);
    if (!split) {
      set(value, model);
      return;
    }
    const nextModel = model.trim() ? `${split.model} ${model}` : split.model;
    set(split.brand, nextModel);
    window.requestAnimationFrame(() => {
      const input = document.getElementById(modelId) as HTMLInputElement | null;
      if (!input) return;
      input.focus();
      input.setSelectionRange(split.model.length, split.model.length);
    });
  }

  function startPay(job: Job) {
    setPaying(job);
    setPay({
      finalCost: String((Number(job.finalCost) || Number(job.estimatedCost) || 0) / 100),
      walletId: wallets.find((w) => w.currency === "MMK")?.id ?? "",
    });
  }

  async function savePay() {
    if (!paying) return;
    setBusy(true);
    try {
      const paid = await api<Job>(`/api/v1/repairs/${paying.id}/pay`, {
        method: "POST",
        body: { finalCost: pay.finalCost || undefined, walletId: pay.walletId || undefined },
      });
      setPaying(null);
      // Straight to the voucher, which now reads ရှင်းပြီး, ready to print.
      openVoucher({ ...paying, finalCost: paid.finalCost, paidAmount: paid.paidAmount });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(job: Job) {
    setEditing(job);
    setEdit({
      ...blankForm,
      customerName: job.customerName ?? "",
      customerPhone: job.customerPhone ?? "",
      deviceBrand: job.deviceBrand,
      deviceModel: job.deviceModel,
      imei: job.imei ?? "",
      accessories: job.accessories ?? "",
      problem: job.problem,
      intakeCondition: job.intakeCondition ?? "",
      priority: job.priority || "NORMAL",
      estimatedCost: String(Number(job.estimatedCost) / 100),
      promisedAt: job.promisedAt ? job.promisedAt.slice(0, 10) : "",
      notes: job.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/api/v1/repairs/${editing.id}/details`, {
        method: "PATCH",
        body: {
          customerName: edit.customerName,
          customerPhone: edit.customerPhone,
          deviceBrand: edit.deviceBrand,
          deviceModel: edit.deviceModel,
          imei: edit.imei,
          accessories: edit.accessories,
          problem: edit.problem,
          intakeCondition: edit.intakeCondition,
          priority: edit.priority,
          estimatedCost: edit.estimatedCost || "0",
          promisedAt: edit.promisedAt,
          notes: edit.notes,
        },
      });
      setEditing(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function startMove(job: Job, to?: string) {
    setWorking(job);
    setMove({
      status: to ?? nextStatuses(job.status)[0] ?? "",
      // Pre-filled with whatever is known: the final charge if set, otherwise the quote.
      finalCost: String((Number(job.finalCost) || Number(job.estimatedCost) || 0) / 100),
      partsCost: Number(job.partsCost) ? String(Number(job.partsCost) / 100) : "",
      walletId: wallets.find((w) => w.currency === "MMK")?.id ?? "",
      notes: "",
    });
  }

  /** A status change straight from the list. Handing a device back takes money, so that one
   *  still goes through the full form. */
  async function quickStatus(job: Job, to: string) {
    if (!to || to === job.status) return;
    if (to === "DELIVERED") {
      startMove(job, to);
      return;
    }
    setQuickSaving(job.id);
    try {
      await api(`/api/v1/repairs/${job.id}`, { method: "PATCH", body: { status: to } });
      // No toast: the pill changing colour is confirmation enough.
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setQuickSaving(null);
    }
  }

  async function applyMove() {
    if (!working || !move.status) return;
    setBusy(true);
    try {
      await api(`/api/v1/repairs/${working.id}`, {
        method: "PATCH",
        body: {
          status: move.status,
          finalCost: move.finalCost || undefined,
          partsCost: move.partsCost || undefined,
          walletId: move.walletId || undefined,
          notes: move.notes || undefined,
        },
      });
      setWorking(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function searchHistory(imei = historyImei) {
    const value = imei.trim();
    if (value.length < 4) return;
    try {
      const d = await api<{ jobs: Job[] }>(`/api/v1/repairs?${new URLSearchParams({ imei: value, pageSize: "100" })}`);
      setHistory({ imei: value, jobs: d.jobs });
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!jobs) return <Spinner />;

  const balance = working
    ? (Number(move.finalCost || 0) * 100 - Number(working.paidAmount)) / 100
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Wrench size={20} className="shrink-0 text-blue-600" />
          <h1 className="truncate text-xl font-bold">Repair Jobs</h1>
        </div>
        {hasPerm("repair.create") && (
          <Button size="sm" onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />Take in a device</Button>
        )}
      </div>

      {/* One slim strip: the month's counts and the month they are for, side by side. */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white text-center dark:border-gray-800 dark:bg-gray-900">
        {[
          { label: "Total", value: summary.total, icon: Wrench, tone: "text-blue-600", status: "" },
          { label: "Working", value: summary.inWorkflow, icon: Clock3, tone: "text-amber-500", status: null },
          { label: "Done", value: summary.completed, icon: CheckCircle2, tone: "text-green-600", status: "DONE" },
          { label: "Delivered", value: summary.delivered, icon: PackageCheck, tone: "text-purple-600", status: "DELIVERED" },
        ].map(({ label, value, icon: Icon, tone, status: to }) => (
          <button
            key={label}
            type="button"
            disabled={to === null}
            onClick={() => to !== null && setStatus(to)}
            className="min-w-0 flex-1 border-r border-gray-200 px-1 py-1.5 hover:bg-gray-50 disabled:hover:bg-transparent dark:border-gray-800 dark:hover:bg-gray-800"
          >
            <div className={cn("flex items-center justify-center gap-1 text-base font-bold tabular-nums", tone)}>
              <Icon size={14} />{value}
            </div>
            <div className="truncate text-[11px] text-gray-500">{label}</div>
          </button>
        ))}
        <input
          type="month"
          aria-label="Summary month"
          title="Devices taken in during the month"
          value={month || summary.month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-[7.5rem] shrink-0 bg-transparent px-2 text-xs sm:w-40 sm:text-sm"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <label className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Voucher no, customer, phone, brand, model or IMEI"
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {REPAIR_STATUSES.map((s) => <option key={s} value={s}>{REPAIR_STATUS_LABELS[s]}</option>)}
        </Select>
      </div>

      {jobs.length === 0 ? (
        <Card><Empty message="No repair jobs yet." /></Card>
      ) : (
        <Table
          headers={["Voucher No", "Device", "Customer", "Problem", "Status", "Charge", "Paid", ""]}
          rightAlign={[5, 6]}
        >
          {jobs.map((job) => {
            const options = nextStatuses(job.status);
            const canQuick = hasPerm("repair.update") && options.length > 0;
            return (
              <tr key={job.id} className="align-top">
                <td className="px-3 py-2.5">
                  <div className="font-mono font-medium">{job.jobNo}</div>
                  <div className="text-xs text-gray-500">{fmtDateTime(job.receivedAt)}</div>
                  {job.priority && job.priority !== "NORMAL" && (
                    <div className={cn("text-xs", PRIORITY_TONE[job.priority] ?? "text-gray-500")}>{job.priority}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{job.deviceBrand} {job.deviceModel}</div>
                  {job.imei && (
                    <button
                      type="button"
                      className="font-mono text-xs text-blue-600 hover:underline"
                      title="Repair history for this device"
                      onClick={() => { setHistoryImei(job.imei!); searchHistory(job.imei!); }}
                    >
                      {job.imei}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div>{job.customerName || "-"}</div>
                  {job.customerPhone && <div className="text-xs text-gray-500">{job.customerPhone}</div>}
                </td>
                <td className="max-w-[16rem] px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                  {job.problem}
                  {job.intakeCondition && <div className="text-xs text-gray-400">Condition: {job.intakeCondition}</div>}
                </td>
                <td className="px-3 py-2.5">
                  {canQuick ? (
                    // Picking a status here saves it at once, so a mistake is one more pick away.
                    <StatusMenu
                      status={job.status}
                      options={options}
                      disabled={quickSaving === job.id}
                      onPick={(s) => quickStatus(job, s)}
                    />
                  ) : (
                    <StatusPill status={job.status} />
                  )}
                  {quickSaving === job.id && <div className="text-xs text-gray-400">Saving…</div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtMoney(Number(job.finalCost) ? job.finalCost : job.estimatedCost)}
                  {!Number(job.finalCost) && <div className="text-xs text-gray-400">estimate</div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtMoney(job.paidAmount)}
                  {settled(job) && <div className="text-xs font-semibold text-green-600">Paid</div>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openVoucher(job)}>
                      <Printer size={14} className="mr-1 inline" />Voucher
                    </Button>
                    {hasPerm("repair.update") && (
                      <Button variant="secondary" size="sm" onClick={() => startEdit(job)}>Edit</Button>
                    )}
                    {hasPerm("repair.update") && job.status !== "CANCELLED" && !settled(job) && (
                      <Button size="sm" onClick={() => startPay(job)}>Mark as paid</Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History size={16} className="text-blue-600" />Device repair history
        </div>
        <p className="text-xs text-gray-500">Enter an IMEI or serial to see every repair this device has had here.</p>
        <div className="flex gap-2">
          <input
            value={historyImei}
            onChange={(e) => setHistoryImei(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") searchHistory(); }}
            placeholder="IMEI or serial number"
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <Button variant="secondary" onClick={() => searchHistory()} disabled={historyImei.trim().length < 4}>
            <History size={16} className="mr-1 inline" />History
          </Button>
        </div>
      </Card>

      {/* Shared by the intake and edit forms. */}
      <datalist id="repair-brand-suggestions">
        {suggestions.brands.map((b) => <option key={b} value={b} />)}
      </datalist>
      <datalist id="repair-model-suggestions">
        {modelSuggestions.map((m) => <option key={m} value={m} />)}
      </datalist>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Take in a device" wide>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            <Input label="Phone" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            <Input label="Brand" list="repair-brand-suggestions" autoComplete="off" value={form.deviceBrand} onChange={(e) => onBrandTyped(e.target.value, form.deviceModel, (deviceBrand, deviceModel) => setForm({ ...form, deviceBrand, deviceModel }), "repair-model-new")} placeholder="Vivo / Oppo / Redmi" />
            <Input id="repair-model-new" label="Model" list="repair-model-suggestions" autoComplete="off" value={form.deviceModel} onChange={(e) => setForm({ ...form, deviceModel: e.target.value })} placeholder={form.deviceBrand ? `${form.deviceBrand} model` : "Y28 / A3x / Note 13"} />
            <Input label="Estimated charge" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} placeholder="0" />
            <Input label="Deposit taken" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0" />
          </div>
          <Input label="Problem" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} placeholder="Screen cracked, no display" />
          {Number(form.depositAmount) > 0 && (
            <Select label="Deposit went into" value={form.depositWalletId} onChange={(e) => setForm({ ...form, depositWalletId: e.target.value })}>
              <option value="">Choose…</option>
              {wallets.filter((w) => w.currency === "MMK").map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
              ))}
            </Select>
          )}

          <button type="button" className="text-sm font-medium text-blue-600 hover:underline" onClick={() => setShowOptional((v) => !v)}>
            {showOptional ? "Hide optional details" : "Add optional details"}
          </button>
          {showOptional && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="IMEI / serial" value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} />
                <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
                <Input label="Promised date" type="date" value={form.promisedAt} onChange={(e) => setForm({ ...form, promisedAt: e.target.value })} />
              </div>
              <Input label="Intake condition" value={form.intakeCondition} onChange={(e) => setForm({ ...form, intakeCondition: e.target.value })} placeholder="Screen crack, water mark, body condition" />
              <Input
                label="Came in with"
                value={form.accessories}
                onChange={(e) => setForm({ ...form, accessories: e.target.value })}
                placeholder="Case, SIM, memory card"
              />
              <p className="text-xs text-gray-500">
                Write down what came with the device. It is the answer if anyone asks later.
              </p>
              <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.deviceBrand.trim() || !form.deviceModel.trim() || !form.problem.trim()}>
              {busy ? "Saving…" : "Take it in"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={paying ? `Mark as paid — ${paying.jobNo}` : ""}>
        {paying && (() => {
          const charge = Math.round(Number(pay.finalCost || 0) * 100);
          const toCollect = Math.max(0, charge - Number(paying.paidAmount));
          return (
            <div className="space-y-3">
              <Input
                label="Final charge"
                value={pay.finalCost}
                disabled={paying.status === "DELIVERED"}
                onChange={(e) => setPay({ ...pay, finalCost: e.target.value })}
              />
              <Card className="space-y-1 bg-gray-50 text-sm dark:bg-gray-800/50">
                <div className="flex justify-between"><span>Already paid (deposit)</span><b className="tabular-nums">{fmtMoney(paying.paidAmount)}</b></div>
                <div className="flex justify-between border-t border-gray-200 pt-1 dark:border-gray-700">
                  <span>To collect now</span>
                  <b className="tabular-nums text-green-600">{fmtMoney(String(toCollect))}</b>
                </div>
              </Card>
              {toCollect > 0 && (
                <Select label="Paid into" value={pay.walletId} onChange={(e) => setPay({ ...pay, walletId: e.target.value })}>
                  <option value="">Choose…</option>
                  {wallets.filter((w) => w.currency === "MMK").map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                  ))}
                </Select>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setPaying(null)}>Cancel</Button>
                <Button onClick={savePay} disabled={busy || charge <= 0 || (toCollect > 0 && !pay.walletId)}>
                  {busy ? "Saving…" : "Mark as paid"}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `${editing.jobNo}` : ""} wide>
        {editing && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Customer name" value={edit.customerName} onChange={(e) => setEdit({ ...edit, customerName: e.target.value })} />
              <Input label="Phone" value={edit.customerPhone} onChange={(e) => setEdit({ ...edit, customerPhone: e.target.value })} />
              <Input label="Brand" list="repair-brand-suggestions" autoComplete="off" value={edit.deviceBrand} onChange={(e) => onBrandTyped(e.target.value, edit.deviceModel, (deviceBrand, deviceModel) => setEdit({ ...edit, deviceBrand, deviceModel }), "repair-model-edit")} />
              <Input id="repair-model-edit" label="Model" list="repair-model-suggestions" autoComplete="off" value={edit.deviceModel} onChange={(e) => setEdit({ ...edit, deviceModel: e.target.value })} />
              <Input label="IMEI / serial" value={edit.imei} onChange={(e) => setEdit({ ...edit, imei: e.target.value })} />
              <Select label="Priority" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <Input label="Problem" value={edit.problem} onChange={(e) => setEdit({ ...edit, problem: e.target.value })} />
            <Input label="Intake condition" value={edit.intakeCondition} onChange={(e) => setEdit({ ...edit, intakeCondition: e.target.value })} />
            <Input label="Came in with" value={edit.accessories} onChange={(e) => setEdit({ ...edit, accessories: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Estimated charge"
                value={edit.estimatedCost}
                disabled={editing.status === "DELIVERED" || editing.status === "CANCELLED"}
                onChange={(e) => setEdit({ ...edit, estimatedCost: e.target.value })}
              />
              <Input label="Promised date" type="date" value={edit.promisedAt} onChange={(e) => setEdit({ ...edit, promisedAt: e.target.value })} />
            </div>
            <Input label="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={busy || !edit.deviceBrand.trim() || !edit.deviceModel.trim() || !edit.problem.trim()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(working)} onClose={() => setWorking(null)} title={working ? `${working.jobNo} — ${working.deviceBrand} ${working.deviceModel}` : ""}>
        {working && (
          <div className="space-y-3">
            <Select label="Move to" value={move.status} onChange={(e) => setMove({ ...move, status: e.target.value })}>
              {nextStatuses(working.status).map((s) => <option key={s} value={s}>{REPAIR_STATUS_LABELS[s]}</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Parts cost" value={move.partsCost} onChange={(e) => setMove({ ...move, partsCost: e.target.value })} />
              <Input label="Final charge" value={move.finalCost} onChange={(e) => setMove({ ...move, finalCost: e.target.value })} />
            </div>

            {move.status === "DELIVERED" && (
              <>
                <Card className="space-y-1 bg-gray-50 text-sm dark:bg-gray-800/50">
                  <div className="flex justify-between"><span>Final charge</span><b className="tabular-nums">{fmtMoney(String(Math.round(Number(move.finalCost || 0) * 100)))}</b></div>
                  <div className="flex justify-between"><span>Already paid (deposit)</span><b className="tabular-nums">{fmtMoney(working.paidAmount)}</b></div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 dark:border-gray-700">
                    <span>To collect now</span>
                    <b className="tabular-nums text-green-600">{fmtMoney(String(Math.round(balance * 100)))}</b>
                  </div>
                </Card>
                {balance > 0 && (
                  <Select label="Balance paid into" value={move.walletId} onChange={(e) => setMove({ ...move, walletId: e.target.value })}>
                    <option value="">Choose…</option>
                    {wallets.filter((w) => w.currency === "MMK").map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                    ))}
                  </Select>
                )}
              </>
            )}

            <Input label="Notes" value={move.notes} onChange={(e) => setMove({ ...move, notes: e.target.value })} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setWorking(null)}>Cancel</Button>
              <Button onClick={applyMove} disabled={busy || !move.status}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title={`Device history — ${history?.imei ?? ""}`}>
        {history && (
          history.jobs.length === 0 ? (
            <Empty message="No repairs found for this IMEI / serial." />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">{history.jobs.length} repair record(s)</p>
              {history.jobs.map((job) => (
                <div key={job.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
                  <div>
                    <div className="font-mono font-medium">{job.jobNo}</div>
                    <div>{job.deviceBrand} {job.deviceModel}</div>
                    <div className="text-gray-500">{job.problem}</div>
                    <div className="text-xs text-gray-400">{fmtDateTime(job.receivedAt)}</div>
                  </div>
                  <StatusPill status={job.status} />
                </div>
              ))}
            </div>
          )
        )}
      </Modal>

      {/* Closing clears the voucher, so a later print of another page does not pick it up. */}
      <Modal open={Boolean(voucher)} onClose={() => setVoucher(null)} title="Repair voucher">
        {voucher && (
          <div className="space-y-3">
            {/* What will print, on a paper-white strip the width of the roll. */}
            <div className="max-h-[55vh] overflow-y-auto rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <div className="mx-auto w-[58mm] max-w-full bg-white py-2 shadow">
                <RepairVoucherSlip data={voucher} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => printReceipt()}>
                <Printer size={16} className="mr-1 inline" />Print voucher
              </Button>
              <Button onClick={() => setVoucher(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
      {voucher && <RepairVoucher data={voucher} />}
    </div>
  );
}

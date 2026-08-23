"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Wrench } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Badge, Button, Card, Empty, Input, Modal, Select, Spinner, Table, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Job {
  id: string; jobNo: string; status: string;
  customerName?: string; customerPhone?: string;
  deviceBrand: string; deviceModel: string; imei?: string;
  accessories?: string; problem: string; notes?: string;
  estimatedCost: string; partsCost: string; finalCost: string;
  depositAmount: string; paidAmount: string;
  receivedAt: string; deliveredAt?: string;
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

/** What a job may become next, mirroring the service. Kept here so the picker never offers
 *  a move the server will refuse — a phone that has gone home cannot go back on the bench. */
const NEXT: Record<string, string[]> = {
  RECEIVED: ["IN_PROGRESS", "WAITING_PARTS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "DONE", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "DONE", "CANCELLED"],
  DONE: ["DELIVERED", "IN_PROGRESS", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export default function RepairsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [openJobs, setOpenJobs] = useState(0);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<Job | null>(null);
  const [move, setMove] = useState({ status: "", finalCost: "", partsCost: "", walletId: "", notes: "" });
  const [form, setForm] = useState({
    customerName: "", customerPhone: "",
    deviceBrand: "", deviceModel: "", imei: "",
    accessories: "", problem: "",
    estimatedCost: "", depositAmount: "", depositWalletId: "",
    promisedAt: "", notes: "",
  });
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    api<{ jobs: Job[]; openJobs: number }>(`/api/v1/repairs?${params}`)
      .then((d) => { setJobs(d.jobs); setOpenJobs(d.openJobs); })
      .catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push, q, status]);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/repairs", {
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
          notes: form.notes || undefined,
        },
      });
      push("Repair job created");
      setShowNew(false);
      setForm({
        customerName: "", customerPhone: "", deviceBrand: "", deviceModel: "", imei: "",
        accessories: "", problem: "", estimatedCost: "", depositAmount: "",
        depositWalletId: "", promisedAt: "", notes: "",
      });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function startMove(job: Job) {
    setWorking(job);
    setMove({
      status: NEXT[job.status]?.[0] ?? "",
      // Pre-filled with whatever is known: the final charge if set, otherwise the quote.
      finalCost: String((Number(job.finalCost) || Number(job.estimatedCost) || 0) / 100),
      partsCost: Number(job.partsCost) ? String(Number(job.partsCost) / 100) : "",
      walletId: wallets.find((w) => w.currency === "MMK")?.id ?? "",
      notes: "",
    });
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
      push(move.status === "DELIVERED" ? "Handed back and paid" : "Repair updated");
      setWorking(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!jobs) return <Spinner />;

  const balance = working
    ? (Number(move.finalCost || 0) * 100 - Number(working.paidAmount)) / 100
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold">Repair Jobs</h1>
          {openJobs > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              {openJobs} on the bench
            </span>
          )}
        </div>
        {hasPerm("repair.create") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />Take in a device</Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <label className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Job no, customer, phone, brand, model or IMEI"
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "DONE", "DELIVERED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>

      {jobs.length === 0 ? (
        <Card><Empty message="No repair jobs yet." /></Card>
      ) : (
        <Table
          headers={["Job", "Device", "Customer", "Problem", "Status", "Charge", "Paid", ""]}
          rightAlign={[5, 6]}
        >
          {jobs.map((job) => (
            <tr key={job.id} className="align-top">
              <td className="px-3 py-2.5">
                <div className="font-mono font-medium">{job.jobNo}</div>
                <div className="text-xs text-gray-500">{fmtDateTime(job.receivedAt)}</div>
              </td>
              <td className="px-3 py-2.5">
                <div className="font-medium">{job.deviceBrand} {job.deviceModel}</div>
                {job.imei && <div className="font-mono text-xs text-gray-500">{job.imei}</div>}
              </td>
              <td className="px-3 py-2.5">
                <div>{job.customerName || "-"}</div>
                {job.customerPhone && <div className="text-xs text-gray-500">{job.customerPhone}</div>}
              </td>
              <td className="max-w-[16rem] px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{job.problem}</td>
              <td className="px-3 py-2.5"><Badge status={job.status} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtMoney(Number(job.finalCost) ? job.finalCost : job.estimatedCost)}
                {!Number(job.finalCost) && <div className="text-xs text-gray-400">estimate</div>}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(job.paidAmount)}</td>
              <td className="px-3 py-2.5 text-right">
                {hasPerm("repair.update") && NEXT[job.status]?.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => startMove(job)}>Update</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Take in a device" wide>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            <Input label="Phone" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            <Input label="Brand" value={form.deviceBrand} onChange={(e) => setForm({ ...form, deviceBrand: e.target.value })} placeholder="Samsung" />
            <Input label="Model" value={form.deviceModel} onChange={(e) => setForm({ ...form, deviceModel: e.target.value })} placeholder="A54" />
            <Input label="IMEI / serial" value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} />
            <Input label="Promised date" type="date" value={form.promisedAt} onChange={(e) => setForm({ ...form, promisedAt: e.target.value })} />
          </div>
          <Input label="Problem" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} placeholder="Screen cracked, no display" />
          <Input
            label="Came in with"
            value={form.accessories}
            onChange={(e) => setForm({ ...form, accessories: e.target.value })}
            placeholder="Case, SIM, memory card"
          />
          <p className="text-xs text-gray-500">
            Write down what came with the device. It is the answer if anyone asks later.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Estimated charge" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} placeholder="0" />
            <Input label="Deposit taken" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0" />
          </div>
          {Number(form.depositAmount) > 0 && (
            <Select label="Deposit went into" value={form.depositWalletId} onChange={(e) => setForm({ ...form, depositWalletId: e.target.value })}>
              <option value="">Choose…</option>
              {wallets.filter((w) => w.currency === "MMK").map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
              ))}
            </Select>
          )}
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.deviceBrand.trim() || !form.deviceModel.trim() || !form.problem.trim()}>
              {busy ? "Saving…" : "Take it in"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(working)} onClose={() => setWorking(null)} title={working ? `${working.jobNo} — ${working.deviceBrand} ${working.deviceModel}` : ""}>
        {working && (
          <div className="space-y-3">
            <Select label="Move to" value={move.status} onChange={(e) => setMove({ ...move, status: e.target.value })}>
              {(NEXT[working.status] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
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
    </div>
  );
}

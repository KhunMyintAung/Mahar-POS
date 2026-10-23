"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

interface Close { id: string; date: string; branchId: string; status: string; summary: string; reopenReason?: string }
interface Summary {
  wallets: { totalMmk: string; totalThb: string; thbWallets: number };
  credit: { newIssued: string; collected: string; outstanding: string };
  payable: { newIssued: string; paid: string; outstanding: string };
  general: { otherIncome: string; expense: string; netCashMovement: string };
}

export default function DailyClosePage() {
  const [items, setItems] = useState<Close[] | null>(null);
  const [preview, setPreview] = useState<{ date: string; summary: Summary; existing?: Close | null } | null>(null);
  const [date, setDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [reopenTarget, setReopenTarget] = useState<Close | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, branches, defaultBranchId } = useAuth();

  const load = useCallback(() => {
    api<{ items: Close[] }>("/api/v1/daily-close").then((d) => setItems(d.items)).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  async function loadPreview() {
    try {
      const b = branchId || defaultBranchId;
      const params = new URLSearchParams({ preview: "1", branchId: b });
      if (date) params.set("date", date);
      setPreview(await api(`/api/v1/daily-close?${params}`));
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function doClose() {
    if (!preview) return;
    setBusy(true);
    try {
      await api("/api/v1/daily-close", {
        method: "POST",
        body: { branchId: branchId || defaultBranchId, date: preview.date, notes: notes || undefined },
      });
      push("Day closed");
      setPreview(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!reopenTarget) return;
    setBusy(true);
    try {
      await api(`/api/v1/daily-close/${reopenTarget.id}/reopen`, { method: "POST", body: { reason: reopenReason } });
      push("Day reopened");
      setReopenTarget(null); setReopenReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;
  const s = preview?.summary;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={<>Daily Close</>} />

      {hasPerm("daily_close.create") && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Close a day</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} />
            {branches.length > 1 && (
              <Select label="Branch" value={branchId || defaultBranchId} onChange={(e) => { setBranchId(e.target.value); setPreview(null); }}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
            <Button variant="secondary" onClick={loadPreview}>Preview summary</Button>
          </div>

          {s && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm lg:grid-cols-3">
                <div className="font-semibold text-gray-500 lg:col-span-3">{preview!.date}</div>
                <div className="font-semibold text-gray-500 lg:col-span-3">Wallets & cash</div>
                <div>MMK: <b className="tabular-nums">{fmtMoney(s.wallets.totalMmk)}</b></div>
                {s.wallets.thbWallets > 0 && <div>THB: <b className="tabular-nums">{fmtMoney(s.wallets.totalThb)}</b></div>}
                <div>Net movement: <b className="tabular-nums">{fmtMoney(s.general.netCashMovement)}</b></div>
                <div className="font-semibold text-gray-500 lg:col-span-3">Credit / Payable / General</div>
                <div>Collected: <b className="tabular-nums">{fmtMoney(s.credit.collected)}</b></div>
                <div>Paid: <b className="tabular-nums">{fmtMoney(s.payable.paid)}</b></div>
                <div>Income − Expense: <b className="tabular-nums">{fmtMoney((BigInt(s.general.otherIncome) - BigInt(s.general.expense)).toString())}</b></div>
              </div>
              <Input label="Closing notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button onClick={doClose} disabled={busy}>{busy ? "Closing…" : `Close ${preview!.date}`}</Button>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-semibold">History</h3>
        {items.length === 0 ? <Empty message="No daily closes yet" /> : (
          <Table headers={["Date", "Status", "Reopen reason", ""]}>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.date}</td>
                <td className="px-3 py-2"><Badge status={c.status} /></td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.reopenReason ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {(c.status === "CLOSED" || c.status === "APPROVED") && hasPerm("daily_close.reopen") && (
                    <Button size="sm" variant="ghost" onClick={() => setReopenTarget(c)}>Reopen</Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!reopenTarget} onClose={() => setReopenTarget(null)} title={`Reopen ${reopenTarget?.date}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Reopening allows transactions to be edited for this date again. The action is logged.</p>
          <Input label="Reason (required)" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReopenTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={reopen} disabled={busy || reopenReason.trim().length < 3}>Reopen day</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

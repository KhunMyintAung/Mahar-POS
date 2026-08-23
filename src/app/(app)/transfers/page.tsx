"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, StatCard, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Transfer {
  id: string;
  txnNo: string;
  sourceWalletId: string;
  destWalletId: string;
  sourceAmount: string;
  destAmount: string;
  rate?: string;
  fee: string;
  notes?: string;
  status: string;
  createdAt: string;
}

interface Wallet {
  id: string;
  name: string;
  currency: string;
  currentBalance: string;
}

const EMPTY_FORM = {
  sourceWalletId: "",
  destWalletId: "",
  amount: "",
  rate: "",
  fee: "0",
  notes: "",
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [todayTotal, setTodayTotal] = useState<{ currency: string; amount: string }[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ transfers: Transfer[]; todayTotal: { currency: string; amount: string }[] }>("/api/v1/wallet-transfers?pageSize=100")
      .then((data) => { setTransfers(data.transfers); setTodayTotal(data.todayTotal); })
      .catch((error) => push(error.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push]);

  useEffect(load, [load]);

  const source = wallets.find((wallet) => wallet.id === form.sourceWalletId);
  const destination = wallets.find((wallet) => wallet.id === form.destWalletId);
  const crossCurrency = Boolean(source && destination && source.currency !== destination.currency);
  const walletName = (id: string) => wallets.find((wallet) => wallet.id === id)?.name ?? "-";

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/wallet-transfers", {
        method: "POST",
        body: { ...form, rate: crossCurrency ? form.rate : undefined },
      });
      push("Transfer completed");
      setShowNew(false);
      setForm(EMPTY_FORM);
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Transfer failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reverse() {
    if (!reverseId) return;
    setBusy(true);
    try {
      await api(`/api/v1/wallet-transfers/${reverseId}/reverse`, { method: "POST", body: { reason: reverseReason } });
      push("Transfer reversed");
      setReverseId(null);
      setReverseReason("");
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Reverse failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!transfers) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Money Transfer</h1>
        <Button onClick={() => setShowNew(true)}>
          <Send size={16} className="mr-1 inline" />
          New transfer
        </Button>
      </div>

      {todayTotal.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {todayTotal.map((t) => (
            <StatCard key={t.currency} label={`Today's transfers (${t.currency})`} value={`${fmtMoney(t.amount)} ${t.currency}`} />
          ))}
        </div>
      )}

      {transfers.length === 0 ? (
        <Card><Empty message="No transfers yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "From", "To", "Amount", "Fee", "Notes", "Status", ""]} rightAlign={[4, 5]}>
          {transfers.map((transfer) => (
            <tr key={transfer.id}>
              <td className="px-3 py-2 text-xs">{transfer.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(transfer.createdAt)}</td>
              <td className="px-3 py-2">{walletName(transfer.sourceWalletId)}</td>
              <td className="px-3 py-2">{walletName(transfer.destWalletId)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtMoney(transfer.sourceAmount)} to {fmtMoney(transfer.destAmount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(transfer.fee)}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{transfer.notes ?? "-"}</td>
              <td className="px-3 py-2"><Badge status={transfer.status} /></td>
              <td className="px-3 py-2">
                {transfer.status === "COMPLETED" && hasPerm("wallet.reverse") && (
                  <Button size="sm" variant="ghost" onClick={() => setReverseId(transfer.id)}>Reverse</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New transfer">
        <div className="space-y-3">
          <Select
            label="From wallet"
            value={form.sourceWalletId}
            onChange={(event) => setForm({ ...form, sourceWalletId: event.target.value })}
          >
            <option value="">Select…</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} ({fmtMoney(wallet.currentBalance)} {wallet.currency})
              </option>
            ))}
          </Select>
          <Select
            label="To wallet"
            value={form.destWalletId}
            onChange={(event) => setForm({ ...form, destWalletId: event.target.value })}
          >
            <option value="">Select…</option>
            {wallets
              .filter((wallet) => wallet.id !== form.sourceWalletId)
              .map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} ({fmtMoney(wallet.currentBalance)} {wallet.currency})
                </option>
              ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={`Amount${source ? ` (${source.currency})` : ""}`}
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              inputMode="decimal"
            />
            <Input
              label={`Fee${source ? ` (${source.currency}, added to what you send)` : ""}`}
              value={form.fee}
              onChange={(event) => setForm({ ...form, fee: event.target.value })}
              inputMode="decimal"
            />
          </div>
          {crossCurrency && (
            <Input
              label={`Exchange rate (${destination!.currency} per 1 ${source!.currency})`}
              value={form.rate}
              onChange={(event) => setForm({ ...form, rate: event.target.value })}
              inputMode="decimal"
            />
          )}
          <Input
            label="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              disabled={
                busy ||
                !form.sourceWalletId ||
                !form.destWalletId ||
                !form.amount ||
                (crossCurrency && !form.rate)
              }
              onClick={create}
            >
              {busy ? "Transferring..." : "Confirm transfer"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!reverseId} onClose={() => setReverseId(null)} title="Reverse transfer">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Both wallet movements will be reversed. This action is logged.</p>
          <Input label="Reason (required)" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReverseId(null)}>Cancel</Button>
            <Button variant="danger" onClick={reverse} disabled={busy || reverseReason.trim().length < 3}>Reverse</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

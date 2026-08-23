"use client";

import { useCallback, useEffect, useState, use } from "react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Entry {
  id: string; direction: string; amount: string; balanceAfter: string;
  refType: string; refId?: string; description?: string; createdAt: string; reversed: boolean;
}
interface Data {
  wallet: { id: string; name: string; code: string; currency: string; currentBalance: string };
  entries: Entry[];
  total: number;
  page: number;
  pageSize: number;
}

// Maps a ledger entry's refType to the endpoint/permission that can void the
// underlying record. TRANSFER_IN/OUT and EXCHANGE_IN/OUT are two-sided — the
// endpoint reverses both legs even though only one shows on this wallet.
const VOID_ACTIONS: Record<string, { endpoint: (id: string) => string; permission: string; verb: string }> = {
  TRANSFER_OUT: { endpoint: (id) => `/api/v1/wallet-transfers/${id}/reverse`, permission: "wallet.reverse", verb: "reverse" },
  TRANSFER_IN: { endpoint: (id) => `/api/v1/wallet-transfers/${id}/reverse`, permission: "wallet.reverse", verb: "reverse" },
  EXCHANGE_OUT: { endpoint: (id) => `/api/v1/exchange/transactions/${id}/reverse`, permission: "exchange.reverse", verb: "reverse" },
  EXCHANGE_IN: { endpoint: (id) => `/api/v1/exchange/transactions/${id}/reverse`, permission: "exchange.reverse", verb: "reverse" },
  INCOME: { endpoint: (id) => `/api/v1/income-expense/${id}/reverse`, permission: "wallet.reverse", verb: "void" },
  EXPENSE: { endpoint: (id) => `/api/v1/income-expense/${id}/reverse`, permission: "wallet.reverse", verb: "void" },
  WITHDRAW: { endpoint: (id) => `/api/v1/income-expense/${id}/reverse`, permission: "wallet.reverse", verb: "void" },
  SALE: { endpoint: (id) => `/api/v1/sales/${id}/cancel`, permission: "sale.cancel", verb: "cancel" },
  PURCHASE: { endpoint: (id) => `/api/v1/purchases/${id}/cancel`, permission: "purchase.cancel", verb: "cancel" },
};

export default function WalletLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [voidEntry, setVoidEntry] = useState<Entry | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<Data>(`/api/v1/wallets/${id}/ledger?page=${page}`)
      .then(setData)
      .catch((e) => push(e.message, "error"));
  }, [id, page, push]);
  useEffect(load, [load]);

  async function confirmVoid() {
    if (!voidEntry?.refId) return;
    const action = VOID_ACTIONS[voidEntry.refType];
    if (!action) return;
    setBusy(true);
    try {
      await api(action.endpoint(voidEntry.refId), { method: "POST", body: { reason: voidReason } });
      push("Voided");
      setVoidEntry(null);
      setVoidReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Void failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{data.wallet.name}</h1>
          <p className="text-sm text-gray-500">Ledger · {data.wallet.code}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-gray-500">Current balance</div>
          <div className="text-2xl font-bold tabular-nums">{fmtMoney(data.wallet.currentBalance)} {data.wallet.currency}</div>
        </div>
      </div>

      {data.entries.length === 0 ? (
        <Card><Empty message="No ledger entries" /></Card>
      ) : (
        <Table headers={["Date", "Type", "Description", "In", "Out", "Balance", ""]} rightAlign={[3, 4, 5]}>
          {data.entries.map((e) => {
            const action = VOID_ACTIONS[e.refType];
            const canVoid = action && e.refId && !e.reversed && hasPerm(action.permission);
            return (
              <tr key={e.id}>
                <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(e.createdAt)}</td>
                <td className="px-3 py-2 text-xs">
                  {e.refType.replace(/_/g, " ")}
                  {e.reversed && <span className="ml-1 text-gray-400">(voided)</span>}
                </td>
                <td className="px-3 py-2 text-xs">{e.description ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-green-600">{e.direction === "DEBIT" ? fmtMoney(e.amount) : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{e.direction === "CREDIT" ? fmtMoney(e.amount) : ""}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(e.balanceAfter)}</td>
                <td className="px-3 py-2">
                  {canVoid && (
                    <Button size="sm" variant="ghost" onClick={() => setVoidEntry(e)}>Void</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <Modal open={!!voidEntry} onClose={() => setVoidEntry(null)} title="Void this record">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {voidEntry && (voidEntry.refType === "TRANSFER_OUT" || voidEntry.refType === "TRANSFER_IN")
              ? "Both wallet movements of this transfer will be reversed."
              : voidEntry && (voidEntry.refType === "EXCHANGE_OUT" || voidEntry.refType === "EXCHANGE_IN")
              ? "Both wallet movements of this exchange will be reversed."
              : "The wallet movement will be reversed."} This action is logged.
          </p>
          <Input label="Reason (required)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidEntry(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmVoid} disabled={busy || voidReason.trim().length < 3}>Void</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Sale {
  id: string; txnNo: string; date: string; total: string; paidAmount: string; profit: string;
  paymentStatus: string; status: string; customerName?: string; createdAt: string;
  lines: { id: string; quantity: number; unitPrice: string; item: { name: string } }[];
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [totals, setTotals] = useState({ amount: "0", profit: "0" });
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ sales: Sale[]; totals: { amount: string; profit: string } }>("/api/v1/sales?pageSize=100")
      .then((d) => { setSales(d.sales); setTotals(d.totals); })
      .catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  async function cancel() {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api(`/api/v1/sales/${cancelTarget.id}/cancel`, { method: "POST", body: { reason } });
      push("Sale cancelled — stock and wallet reversed");
      setCancelTarget(null); setReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!sales) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sales</h1>
        {hasPerm("sale.create") && <Link href="/pos"><Button>Open POS</Button></Link>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total sales" value={fmtMoney(totals.amount, "MMK")} />
        <StatCard label="Total profit" value={fmtMoney(totals.profit, "MMK")} tone={BigInt(totals.profit) >= 0n ? "green" : "red"} />
      </div>

      {sales.length === 0 ? (
        <Card><Empty message="No sales yet — open the POS to make the first sale" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Customer", "Items", "Total", "Paid", "Profit", "Status", ""]} rightAlign={[4, 5, 6]}>
          {sales.map((s) => (
            <tr key={s.id} className={s.status === "CANCELLED" ? "opacity-50" : ""}>
              <td className="px-3 py-2 text-xs">{s.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(s.createdAt)}</td>
              <td className="px-3 py-2">{s.customerName ?? "Walk-in"}</td>
              <td className="px-3 py-2 text-xs">
                <button className="text-blue-600 hover:underline" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                  {s.lines.length} item(s)
                </button>
                {expanded === s.id && (
                  <ul className="mt-1 space-y-0.5 text-gray-500">
                    {s.lines.map((l) => (
                      <li key={l.id}>{l.item.name} × {l.quantity} @ {fmtMoney(l.unitPrice)}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(s.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(s.paidAmount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-600">{fmtMoney(s.profit)}</td>
              <td className="px-3 py-2"><Badge status={s.status === "CANCELLED" ? "CANCELLED" : s.paymentStatus} /></td>
              <td className="px-3 py-2">
                {s.status === "COMPLETED" && hasPerm("sale.cancel") && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelTarget(s)}>Cancel</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title={`Cancel ${cancelTarget?.txnNo}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Stock returns to inventory and any wallet receipt is reversed. This is logged.
          </p>
          <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Close</Button>
            <Button variant="danger" onClick={cancel} disabled={busy || reason.trim().length < 3}>Cancel sale</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

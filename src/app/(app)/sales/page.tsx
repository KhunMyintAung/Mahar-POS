"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer, Search } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { SaleReceipt, type ReceiptData } from "@/components/SaleReceipt";
import { printReceipt } from "@/lib/printReceipt";
import { buildTextReceipt, sendToRawbt } from "@/lib/thermalReceipt";

interface Sale {
  id: string; txnNo: string; date: string; total: string; paidAmount: string; profit: string;
  subtotal: string; discount: string;
  paymentStatus: string; status: string; customerName?: string; cashierName?: string; createdAt: string;
  lines: { id: string; quantity: number; unitPrice: string; item: { name: string } }[];
}

/** Amounts come back in minor units; the slip prints whole kyat, as at the till. */
const major = (minor: string) => Number(minor) / 100;

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [totals, setTotals] = useState({ amount: "0", profit: "0" });
  const [q, setQ] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { push } = useToast();
  const { hasPerm, me } = useAuth();

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (q.trim()) params.set("q", q.trim());
    api<{ sales: Sale[]; totals: { amount: string; profit: string } }>(`/api/v1/sales?${params}`)
      .then((d) => { setSales(d.sales); setTotals(d.totals); })
      .catch((e) => push(e.message, "error"));
  }, [push, q]);
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

  /** Rebuild the slip from what was saved. Change given is not stored, so it is left off. */
  function openReprint(s: Sale) {
    const total = major(s.total);
    const paid = major(s.paidAmount);
    setReceipt({
      txnNo: s.txnNo,
      at: s.createdAt,
      shopName: me?.business?.name ?? "Mahar Mini POS",
      shopPhone: me?.business?.phone ?? undefined,
      shopAddress: me?.business?.address ?? undefined,
      customerName: s.customerName,
      cashierName: s.cashierName,
      lines: s.lines.map((l) => ({ name: l.item.name, quantity: l.quantity, unitPrice: major(l.unitPrice) })),
      subtotal: major(s.subtotal),
      discount: major(s.discount),
      total,
      paid,
      change: 0,
      credit: Math.max(0, total - paid),
    });
  }

  if (!sales) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sale History</h1>
        {hasPerm("sale.create") && <Link href="/pos"><Button>Open POS</Button></Link>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total sales" value={fmtMoney(totals.amount, "MMK")} />
        <StatCard label="Total profit" value={fmtMoney(totals.profit, "MMK")} tone={BigInt(totals.profit) >= 0n ? "green" : "red"} />
      </div>

      <label className="relative block">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by transaction no"
          className="min-h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </label>

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
                <div className="flex justify-end gap-1">
                  {s.status === "COMPLETED" && (
                    <Button size="sm" variant="secondary" onClick={() => openReprint(s)}>
                      <Printer size={14} className="mr-1 inline" />Reprint
                    </Button>
                  )}
                  {s.status === "COMPLETED" && hasPerm("sale.cancel") && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelTarget(s)}>Cancel</Button>
                  )}
                </div>
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

      {/* Closing clears the slip, so a later print of another page does not pick it up. */}
      <Modal open={Boolean(receipt)} onClose={() => setReceipt(null)} title={`Reprint ${receipt?.txnNo ?? ""}`}>
        {receipt && (
          <div className="space-y-3">
            <p className="text-center text-2xl font-bold text-blue-600">{receipt.total.toLocaleString()} MMK</p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                if (!sendToRawbt(buildTextReceipt(receipt))) {
                  push("Could not reach RawBT. Install it from the Play Store first.", "error");
                }
              }}
            >
              <Printer size={16} className="mr-1 inline" />Print to roll printer (RawBT)
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => printReceipt()}>
                <Printer size={16} className="mr-1 inline" />Print slip
              </Button>
              <Button onClick={() => setReceipt(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
      {receipt && <SaleReceipt data={receipt} />}
    </div>
  );
}

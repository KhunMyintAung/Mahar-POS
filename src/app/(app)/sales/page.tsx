"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, Search, ShieldCheck } from "lucide-react";
import { addDays, todayBusinessDate } from "@/lib/dates";
import { WarrantyCardDialog } from "@/components/WarrantyCard";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { Paginated } from "@/components/Pager";
import { useAuth } from "@/components/AppShell";
import { SaleReceipt, SaleReceiptSlip, type ReceiptData } from "@/components/SaleReceipt";
import { printSaleReceipt } from "@/lib/slipPrint";
import { warrantyUntil } from "@/lib/warranty";
import { PageHeader } from "@/components/PageHeader";

interface Sale {
  id: string; txnNo: string; date: string; total: string; paidAmount: string; profit: string;
  subtotal: string; discount: string;
  paymentStatus: string; status: string; customerName?: string; cashierName?: string; createdAt: string;
  lines: {
    id: string; quantity: number; unitPrice: string; item: { name: string };
    warranty?: string | null; warrantyDays: number; warrantyCondition?: string | null; note?: string | null;
    imeis?: string[];
  }[];
}

/** Amounts come back in minor units; the slip prints whole kyat, as at the till. */
const major = (minor: string) => Number(minor) / 100;

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [totals, setTotals] = useState({ amount: "0", profit: "0" });
  const [q, setQ] = useState("");
  // One day at a time, today first. A search looks across every day, so an old voucher is found.
  const [date, setDate] = useState(() => todayBusinessDate());
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cardFor, setCardFor] = useState<ReceiptData | null>(null);
  const { push } = useToast();
  const { hasPerm, me } = useAuth();

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "1000" });
    if (q.trim()) params.set("q", q.trim());
    else if (date) params.set("date", date);
    api<{ sales: Sale[]; totals: { amount: string; profit: string } }>(`/api/v1/sales?${params}`)
      .then((d) => { setSales(d.sales); setTotals(d.totals); })
      .catch((e) => push(e.message, "error"));
  }, [push, q, date]);
  useEffect(load, [load]);

  async function cancel() {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api(`/api/v1/sales/${cancelTarget.id}/cancel`, { method: "POST", body: { reason } });
      push("Sale voided — stock and wallet reversed");
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
    setReceipt(receiptFor(s));
  }

  function receiptFor(s: Sale): ReceiptData {
    const total = major(s.total);
    const paid = major(s.paidAmount);
    return {
      txnNo: s.txnNo,
      at: s.createdAt,
      shopName: me?.business?.name ?? "Mahar Mini POS",
      shopLogo: me?.business?.logoUrl ?? undefined,
      shopPhone: me?.business?.phone ?? undefined,
      shopAddress: me?.business?.address ?? undefined,
      customerName: s.customerName,
      cashierName: s.cashierName,
      lines: s.lines.map((l) => ({
        name: l.item.name,
        quantity: l.quantity,
        unitPrice: major(l.unitPrice),
        warranty: l.warranty ?? undefined,
        // Counted from when the sale was made, so a reprint carries the same end date.
        warrantyUntil: l.warranty ? warrantyUntil(new Date(s.createdAt), l.warrantyDays)?.toISOString() : undefined,
        warrantyCondition: l.warrantyCondition ?? undefined,
        note: l.note ?? undefined,
        imeis: l.imeis?.length ? l.imeis : undefined,
      })),
      subtotal: major(s.subtotal),
      discount: major(s.discount),
      total,
      paid,
      change: 0,
      credit: Math.max(0, total - paid),
    };
  }

  if (!sales) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* Search and the totals on one row, so the list starts high. */}
      <PageHeader
        title={<>Sale History</>}
        lead={
          <>
            <label className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by transaction no" className="min-h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:text-sm pl-9" />
            </label>
            <div className={`flex shrink-0 items-center gap-1 ${q.trim() ? "opacity-40" : ""}`} title={q.trim() ? "Searching every day" : undefined}>
              <button type="button" aria-label="Day before" onClick={() => setDate((d) => addDays(d || todayBusinessDate(), -1))} className="flex h-9 w-8 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700"><ChevronLeft size={16} /></button>
              <input type="date" aria-label="Day" value={date} max={todayBusinessDate()} onChange={(e) => setDate(e.target.value)} className="min-h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              <button type="button" aria-label="Next day" disabled={date >= todayBusinessDate()} onClick={() => setDate((d) => addDays(d, 1))} className="flex h-9 w-8 items-center justify-center rounded-lg border border-gray-300 disabled:opacity-40 dark:border-gray-700"><ChevronRight size={16} /></button>
              {date !== todayBusinessDate() && (
                <button type="button" onClick={() => setDate(todayBusinessDate())} className="whitespace-nowrap rounded-lg px-2 text-sm font-medium text-blue-600 hover:underline">Today</button>
              )}
            </div>
            <span className="flex flex-wrap gap-x-3 text-sm text-gray-600 dark:text-gray-300">
              <span className="whitespace-nowrap"><span>Total sales</span>: <b className="tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(totals.amount, "MMK")}</b></span>
              <span className="whitespace-nowrap"><span>Total profit</span>: <b className={`tabular-nums ${BigInt(totals.profit) >= 0n ? "text-green-600" : "text-red-600"}`}>{fmtMoney(totals.profit, "MMK")}</b></span>
            </span>
          </>
        }
      />

      {sales.length === 0 ? (
        <Card><Empty message={q.trim() ? "No sale matches that search" : "No sales on this day"} /></Card>
      ) : (
        <Paginated rows={sales} resetKey={[q, date]}>{(pageRows) => (
        <Table headers={["Txn", "Date", "Customer", "Items", "Total", "Paid", "Profit", "Status", ""]} rightAlign={[4, 5, 6]}>
          {pageRows.map((s) => (
            <tr key={s.id} className={s.status === "CANCELLED" ? "opacity-50" : ""}>
              <td className="px-3 py-2 text-xs">{s.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(s.createdAt)}</td>
              <td className="px-3 py-2">{s.customerName ?? "Walk-in"}</td>
              <td className="px-3 py-2 text-xs">
                <button className="text-blue-600 hover:underline" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                  {`${s.lines.length} item(s)`}
                </button>
                {expanded === s.id && (
                  <ul className="mt-1 space-y-0.5 text-gray-500">
                    {s.lines.map((l) => (
                      <li key={l.id}>
                        {l.item.name} × {l.quantity} {BigInt(l.unitPrice) === 0n ? <b className="text-pink-600">FOC</b> : <>@ {fmtMoney(l.unitPrice)}</>}
                        {l.warranty && <span className="ml-1 text-green-600">· {l.warranty}</span>}
                        {l.note && <span className="ml-1 text-gray-400">· {l.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(s.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(s.paidAmount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-600">{fmtMoney(s.profit)}</td>
              <td className="px-3 py-2"><Badge status={s.status === "CANCELLED" ? "VOID" : s.paymentStatus} /></td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  {s.status === "COMPLETED" && (
                    <Button size="sm" variant="secondary" onClick={() => openReprint(s)}>
                      <Printer size={14} className="mr-1 inline" />Reprint
                    </Button>
                  )}
                  {s.status === "COMPLETED" && s.lines.some((l) => l.warranty && l.warrantyDays > 0) && (
                    <Button size="sm" variant="secondary" onClick={() => setCardFor(receiptFor(s))}>
                      <ShieldCheck size={14} className="mr-1 inline text-green-600" />Warranty
                    </Button>
                  )}
                  {s.status === "COMPLETED" && hasPerm("sale.cancel") && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancelTarget(s)}>Void</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        )}</Paginated>
      )}

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title={`Void ${cancelTarget?.txnNo}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Stock returns to inventory and any wallet receipt is reversed. This is logged.
          </p>
          <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Close</Button>
            <Button variant="danger" onClick={cancel} disabled={busy || reason.trim().length < 3}>Void sale</Button>
          </div>
        </div>
      </Modal>

      <WarrantyCardDialog receipt={cardFor} onClose={() => setCardFor(null)} />

      {/* Closing clears the slip, so a later print of another page does not pick it up. */}
      <Modal open={Boolean(receipt)} onClose={() => setReceipt(null)} title={`Reprint ${receipt?.txnNo ?? ""}`}>
        {receipt && (
          <div className="space-y-3">
            {/* What will print, on a paper-white strip the width of the roll. */}
            <div className="max-h-[55vh] overflow-y-auto rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <div className="mx-auto w-[58mm] max-w-full bg-white py-2 shadow">
                <SaleReceiptSlip data={receipt} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => receipt && printSaleReceipt(receipt)}>
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Badge, Button, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { printElement } from "@/lib/printReceipt";

interface PurchaseVoucherData {
  id: string; txnNo: string; date: string; createdAt: string; status: string; paymentStatus: string;
  subtotal: string; discount: string; total: string; paidAmount: string; reference?: string | null; notes?: string | null;
  lines: { id: string; quantity: number; unitCost: string; lineTotal: string; imeis: string[]; item: { name: string; sku: string } }[];
  business: { name: string; phone?: string | null; address?: string | null } | null;
  supplierName: string | null; supplierPhone: string | null; walletName: string | null; createdByName: string | null;
}

/** A purchase as a voucher, opened by its id: the items, their cost, the supplier and how
 *  it was paid, with a Print button. */
export function PurchaseVoucherDialog({ purchaseId, onClose }: { purchaseId: string | null; onClose: () => void }) {
  const [data, setData] = useState<PurchaseVoucherData | null>(null);
  const [error, setError] = useState("");
  const slip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!purchaseId) return;
    let live = true;
    api<PurchaseVoucherData>(`/api/v1/purchases/${purchaseId}`)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Failed"); });
    return () => { live = false; setData(null); };
  }, [purchaseId]);

  // A cancelled purchase owes nothing, whatever was left unpaid on it.
  const unpaid = data && data.status !== "CANCELLED" ? BigInt(data.total) - BigInt(data.paidAmount) : 0n;
  return (
    <Modal open={Boolean(purchaseId)} onClose={onClose} title={data ? `Purchase voucher · ${data.txnNo}` : "Purchase voucher"}
      footer={data && (
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => slip.current && void printElement(slip.current)}><Printer size={16} className="mr-1 inline" />Print</Button>
        </>
      )}>
      {error ? <p className="text-sm text-red-600">{error}</p> : !data ? <Spinner /> : (
        <div ref={slip} className="space-y-3 rounded-lg bg-white p-3 text-sm text-gray-900">
          <div className="text-center">
            <div className="text-base font-bold">{data.business?.name}</div>
            {data.business?.phone && <div className="text-xs">{data.business.phone}</div>}
            {data.business?.address && <div className="text-xs">{data.business.address}</div>}
            <div className="mt-2 text-sm font-semibold">Purchase voucher</div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <span>Voucher no</span><b className="text-right">{data.txnNo}</b>
            <span>Date</span><span className="text-right">{fmtDateTime(data.createdAt)}</span>
            <span>Supplier</span><span className="text-right">{data.supplierName ?? "—"}{data.supplierPhone ? ` · ${data.supplierPhone}` : ""}</span>
            {data.reference && <><span>Reference</span><span className="text-right">{data.reference}</span></>}
            {data.createdByName && <><span>Recorded by</span><span className="text-right">{data.createdByName}</span></>}
          </div>
          <table className="w-full border-y border-dashed border-gray-400 text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-1 font-medium">Item</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Cost</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="py-1 pr-1">
                    {l.item.name}
                    {l.imeis.length > 0 && <div className="font-mono text-[10px] text-gray-600">{l.imeis.join(", ")}</div>}
                  </td>
                  <td className="py-1 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-1 text-right tabular-nums">{BigInt(l.unitCost) === 0n ? "FOC" : fmtMoney(l.unitCost)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtMoney(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-y-0.5 text-xs">
            {BigInt(data.discount) > 0n && <><span>Subtotal</span><span className="text-right tabular-nums">{fmtMoney(data.subtotal)}</span>
              <span>Discount</span><span className="text-right tabular-nums">-{fmtMoney(data.discount)}</span></>}
            <b>Total</b><b className="text-right tabular-nums">{fmtMoney(data.total, "MMK")}</b>
            <span>Paid{data.walletName ? ` (${data.walletName})` : ""}</span><span className="text-right tabular-nums">{fmtMoney(data.paidAmount)}</span>
            {unpaid > 0n && <><span>Still owed</span><b className="text-right tabular-nums text-amber-700">{fmtMoney(unpaid.toString())}</b></>}
          </div>
          <div className="flex items-center justify-between">
            <Badge status={data.status === "CANCELLED" ? "CANCELLED" : data.paymentStatus} />
            {data.notes && <span className="text-xs text-gray-600">{data.notes}</span>}
          </div>
        </div>
      )}
    </Modal>
  );
}

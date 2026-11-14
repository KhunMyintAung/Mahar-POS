"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Badge, Button, Input, Modal, Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { openPrintWindow, printPurchaseVoucher } from "@/lib/slipPrint";
import { useAuth, useCurrency } from "@/components/AppShell";

interface PurchaseVoucherData {
  id: string; txnNo: string; date: string; createdAt: string; status: string; paymentStatus: string;
  subtotal: string; discount: string; total: string; reference?: string | null; notes?: string | null;
  /** Paid in all; of it, at purchase (from walletName) and to the supplier since. */
  paidAmount: string; paidAtPurchase?: string; paidSince?: string;
  lines: { id: string; quantity: number; unitCost: string; lineTotal: string; imeis: string[]; item: { name: string; sku: string } }[];
  business: { name: string; phone?: string | null; address?: string | null } | null;
  supplierName: string | null; supplierPhone: string | null; walletName: string | null; createdByName: string | null;
  /** What it was bought for (its expense side), and whether it was a trade-in phone. */
  line?: "SALE" | "SERVICE" | null; tradeIn?: boolean;
}

/** A purchase as a voucher, opened by its id: the items, their cost, the supplier and how
 *  it was paid, with a Print button. */
export function PurchaseVoucherDialog({ purchaseId, onClose }: { purchaseId: string | null; onClose: () => void }) {
  const cur = useCurrency();
  const { hasPerm } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState<PurchaseVoucherData | null>(null);
  const [error, setError] = useState("");
  // The supplier's own voucher no is typed here on the voucher, not on the busy new-purchase form.
  const [ref, setRef] = useState("");
  const [savingRef, setSavingRef] = useState(false);
  const canEdit = hasPerm("purchase.create");

  useEffect(() => {
    if (!purchaseId) return;
    let live = true;
    api<PurchaseVoucherData>(`/api/v1/purchases/${purchaseId}`)
      .then((d) => { if (live) { setData(d); setRef(d.reference ?? ""); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Failed"); });
    return () => { live = false; setData(null); setRef(""); };
  }, [purchaseId]);

  async function saveRef() {
    if (!data) return;
    setSavingRef(true);
    try {
      await api(`/api/v1/purchases/${data.id}`, { method: "PATCH", body: { reference: ref.trim() } });
      setData({ ...data, reference: ref.trim() || null });
      push("Supplier voucher no saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setSavingRef(false);
    }
  }

  // A cancelled purchase owes nothing, whatever was left unpaid on it.
  const unpaid = data && data.status !== "CANCELLED" ? BigInt(data.total) - BigInt(data.paidAmount) : 0n;
  return (
    <Modal open={Boolean(purchaseId)} onClose={onClose} title={data ? `Purchase voucher · ${data.txnNo}` : "Purchase voucher"}
      footer={data && (
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => {
            // Opened in the click, so the browser does not block it; then the 80mm slip is written in.
            const win = openPrintWindow();
            const n = (v: string) => Number(v) / 100;
            printPurchaseVoucher({
              txnNo: data.txnNo, createdAt: data.createdAt, status: data.status, paymentStatus: data.paymentStatus,
              subtotal: n(data.subtotal), discount: n(data.discount), total: n(data.total), paid: n(data.paidAmount), paidSince: n(data.paidSince ?? "0"),
              reference: data.reference, notes: data.notes,
              lines: data.lines.map((l) => ({ name: l.item.name, quantity: l.quantity, unitCost: n(l.unitCost), lineTotal: n(l.lineTotal), imeis: l.imeis })),
              shopName: data.business?.name ?? "", shopPhone: data.business?.phone, shopAddress: data.business?.address,
              currency: cur,
              supplierName: data.supplierName, supplierPhone: data.supplierPhone, walletName: data.walletName, createdByName: data.createdByName,
            }, win);
          }}><Printer size={16} className="mr-1 inline" />Print</Button>
        </>
      )}>
      {error ? <p className="text-sm text-red-600">{error}</p> : !data ? <Spinner /> : (
        <>
          {canEdit && data.status !== "CANCELLED" && (
            <div className="mb-3 flex items-end gap-2">
              <div className="flex-1"><Input label="Supplier voucher no" value={ref} placeholder="SO/11/26/170879" onChange={(e) => setRef(e.target.value)} /></div>
              <Button variant="secondary" onClick={saveRef} disabled={savingRef || ref.trim() === (data.reference ?? "")}>{savingRef ? "Saving…" : "Save"}</Button>
            </div>
          )}
          <div className="space-y-3 rounded-lg bg-white p-3 text-sm text-gray-900">
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
            {data.line && <><span>Bought for</span><span className="text-right">{data.line === "SERVICE" ? "Daily Service Expense" : "Daily Sale Expense"}</span></>}
            {data.tradeIn && <><span>Purchase type</span><span className="text-right">Trade-in</span></>}
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
            <b>Total</b><b className="text-right tabular-nums">{fmtMoney(data.total, cur)}</b>
            <span>Paid{data.walletName ? ` (${data.walletName})` : ""}</span><span className="text-right tabular-nums">{fmtMoney(data.paidAtPurchase ?? data.paidAmount)}</span>
            {BigInt(data.paidSince ?? "0") > 0n && <><span>Paid to supplier since</span><span className="text-right tabular-nums">{fmtMoney(data.paidSince ?? "0")}</span></>}
            {unpaid > 0n && <><span>Still owed</span><b className="text-right tabular-nums text-amber-700">{fmtMoney(unpaid.toString())}</b></>}
          </div>
          <div className="flex items-center justify-between">
            <Badge status={data.status === "CANCELLED" ? "CANCELLED" : data.paymentStatus} />
            {data.notes && <span className="text-xs text-gray-600">{data.notes}</span>}
          </div>
        </div>
        </>
      )}
    </Modal>
  );
}

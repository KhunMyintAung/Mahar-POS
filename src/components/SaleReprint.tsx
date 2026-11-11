"use client";

import { Printer } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { SaleReceipt, SaleReceiptSlip, type ReceiptData } from "@/components/SaleReceipt";
import { printSaleReceipt } from "@/lib/slipPrint";
import { warrantyUntil } from "@/lib/warranty";

/** A saved sale as the sales API returns it, enough to print its slip again. */
export interface SavedSale {
  txnNo: string; total: string; paidAmount: string; subtotal: string; discount: string;
  customerName?: string; cashierName?: string; createdAt: string;
  lines: {
    quantity: number; unitPrice: string; item: { name: string };
    warranty?: string | null; warrantyDays: number; warrantyCondition?: string | null; note?: string | null;
    imeis?: string[];
  }[];
}

interface Shop { name?: string; logoUrl?: string | null; phone?: string | null; address?: string | null; currency?: string | null }

/** Amounts come back in minor units; the slip prints whole kyat, as at the till. */
const major = (minor: string) => Number(minor) / 100;

/** Rebuild the slip from what was saved. Change given is not stored, so it is left off. */
export function receiptForSale(s: SavedSale, shop?: Shop | null): ReceiptData {
  const total = major(s.total);
  const paid = major(s.paidAmount);
  return {
    txnNo: s.txnNo,
    at: s.createdAt,
    shopName: shop?.name ?? "Mahar Mini POS",
    shopLogo: shop?.logoUrl ?? undefined,
    shopPhone: shop?.phone ?? undefined,
    shopAddress: shop?.address ?? undefined,
    currency: shop?.currency ?? undefined,
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

/** The slip as it will print, with Print and Close. Closing clears it, so a later print of
 *  another page does not pick it up. */
export function SaleReprintDialog({ receipt, onClose }: { receipt: ReceiptData | null; onClose: () => void }) {
  return (
    <>
      <Modal open={Boolean(receipt)} onClose={onClose} title={`Reprint ${receipt?.txnNo ?? ""}`}>
        {receipt && (
          <div className="space-y-3">
            {/* What will print, on a paper-white strip the width of the roll. */}
            <div className="max-h-[55vh] overflow-y-auto rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <div className="mx-auto w-[58mm] max-w-full bg-white py-2 shadow">
                <SaleReceiptSlip data={receipt} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => printSaleReceipt(receipt)}>
                <Printer size={16} className="mr-1 inline" />Print slip
              </Button>
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
      {receipt && <SaleReceipt data={receipt} />}
    </>
  );
}

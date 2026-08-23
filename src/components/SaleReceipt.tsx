"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDateTime } from "@/lib/format";

/** What a slip needs, captured at the moment of sale.
 *
 *  Taken as a snapshot rather than read back off the cart, because the cart is emptied the
 *  instant the sale goes through — printing afterwards would otherwise print nothing.
 */
export interface ReceiptData {
  txnNo: string;
  at: string;
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  customerName?: string;
  cashierName?: string;
  lines: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change: number;
  credit: number;
}

function money(value: number): string {
  return Math.round(value).toLocaleString();
}

/** Sized for a 58mm till roll, which is what these counters have. Printing is done by the
 *  browser: no driver to install, and it works from a phone over Bluetooth just as well as
 *  from a desktop. */
export function SaleReceipt({ data }: { data: ReceiptData }) {
  // Portalled to <body> so the print stylesheet can hide the slip's siblings and leave it
  // alone in the document. Rendered in place it sat several layers deep inside the page,
  // and the only ways to isolate it took it out of normal flow — which is what clipped it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deferred a tick, as elsewhere in the app, so this is an ordinary update rather than
    // one made during the effect. There is no document.body to portal into on the server.
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div id="sale-receipt" className="hidden print:block">
      {/* The sheet itself is 58mm (see @page receipt), so the slip fills it rather than
          sitting as a narrow column in the middle of a larger page. */}
      <div className="w-full max-w-[58mm] px-1 font-mono text-[10px] leading-tight text-black">
        <div className="text-center">
          <div className="text-[13px] font-bold">{data.shopName}</div>
          {data.shopPhone && <div>{data.shopPhone}</div>}
          {data.shopAddress && <div>{data.shopAddress}</div>}
        </div>

        <div className="my-1 border-t border-dashed border-black" />

        <div className="flex justify-between"><span>{data.txnNo}</span><span>{fmtDateTime(data.at)}</span></div>
        {data.customerName && <div>Customer: {data.customerName}</div>}
        {data.cashierName && <div>By: {data.cashierName}</div>}

        <div className="my-1 border-t border-dashed border-black" />

        {data.lines.map((line, index) => (
          <div key={`${line.name}-${index}`} className="mb-0.5">
            <div className="truncate">{line.name}</div>
            <div className="flex justify-between">
              <span>{line.quantity} x {money(line.unitPrice)}</span>
              <span>{money(line.quantity * line.unitPrice)}</span>
            </div>
          </div>
        ))}

        <div className="my-1 border-t border-dashed border-black" />

        <div className="flex justify-between"><span>Subtotal</span><span>{money(data.subtotal)}</span></div>
        {data.discount > 0 && (
          <div className="flex justify-between"><span>Discount</span><span>-{money(data.discount)}</span></div>
        )}
        <div className="flex justify-between text-[12px] font-bold">
          <span>TOTAL</span><span>{money(data.total)}</span>
        </div>
        <div className="flex justify-between"><span>Paid</span><span>{money(data.paid)}</span></div>
        {data.change > 0 && (
          <div className="flex justify-between"><span>Change</span><span>{money(data.change)}</span></div>
        )}
        {data.credit > 0 && (
          <div className="flex justify-between font-bold"><span>Owing</span><span>{money(data.credit)}</span></div>
        )}

        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-center">Thank you</div>
      </div>
    </div>,
    document.body
  );
}

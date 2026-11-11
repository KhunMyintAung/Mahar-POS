"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDateTime } from "@/lib/format";
import { usePrintSlip } from "@/lib/usePrintSlip";
import { receiptHasOwnLanguage, receiptText } from "@/lib/saleReceiptText";

/** What a slip needs, captured at the moment of sale.
 *
 *  Taken as a snapshot rather than read back off the cart, because the cart is emptied the
 *  instant the sale goes through — printing afterwards would otherwise print nothing.
 */
export interface ReceiptData {
  txnNo: string;
  at: string;
  shopName: string;
  /** Settings → Business logo, as a data URL. */
  shopLogo?: string;
  shopPhone?: string;
  shopAddress?: string;
  /** The shop's main currency: printed after the total, and the receipt is in its language
   *  (Thai for THB). MMK when not given. */
  currency?: string;
  customerName?: string;
  cashierName?: string;
  /** warranty is the label given at the till; warrantyUntil (ISO) is set when it has a length. */
  lines: {
    name: string; quantity: number; unitPrice: number; foc?: boolean;
    warranty?: string; warrantyUntil?: string; warrantyCondition?: string; note?: string;
    /** The phones sold on this line, by IMEI. */
    imeis?: string[];
  }[];
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
  usePrintSlip();
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
      <SaleReceiptSlip data={data} />
    </div>,
    document.body
  );
}

/** The slip itself, used both for printing and to show what will print.
 *
 *  Laid out like the multishop app's receipt, which shops found clear: the shop's name and
 *  "Sale Receipt" up top, the invoice details between dashed rules, a four-column item table,
 *  and a ruled grand total. Drawn at 58mm and scaled up whole for 80mm paper. */
export function SaleReceiptSlip({ data }: { data: ReceiptData }) {
  const rule = "border-t border-dashed border-gray-500";
  const row = "flex justify-between gap-2 py-[1px]";
  const t = receiptText(data.currency);
  const cur = data.currency ?? "MMK";
  // A Thai or English shop's receipt is its own text; an MMK shop's follows the screen as before.
  const own = receiptHasOwnLanguage(data.currency) ? { "data-no-i18n": "" } : {};
  return (
    <div {...own} className="w-full max-w-[58mm] px-1 text-[10px] leading-snug text-black" style={{ fontFamily: "Arial, 'Pyidaungsu', 'Myanmar Text', sans-serif" }}>
      <div className="text-center">
        {data.shopLogo && (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
          <img src={data.shopLogo} alt="" className="slip-logo mx-auto mb-1 max-h-[14mm] max-w-[46mm] object-contain" />
        )}
        <div className="text-[14px] font-bold leading-tight">{data.shopName}</div>
        <div className="mt-0.5">{t.title}</div>
        {(data.shopPhone || data.shopAddress) && (
          <div className="text-gray-600">{[data.shopPhone, data.shopAddress].filter(Boolean).join(" · ")}</div>
        )}
      </div>

      <div className="my-1.5 border-y border-dashed border-gray-500 py-1">
        <div className={row}><span className="text-gray-600">{t.invoice}</span><b>{data.txnNo}</b></div>
        <div className={row}><span className="text-gray-600">{t.date}</span><b>{fmtDateTime(data.at)}</b></div>
        {data.cashierName && <div className={row}><span className="text-gray-600">{t.cashier}</span><b>{data.cashierName}</b></div>}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[9px]">
            <th className="py-0.5 text-left font-bold">{t.item}</th>
            <th className="py-0.5 pl-1 text-center font-bold">{t.qty}</th>
            <th className="whitespace-nowrap py-0.5 pl-1.5 text-right font-bold">{t.price}</th>
            <th className="whitespace-nowrap py-0.5 pl-1.5 text-right font-bold">{t.amount}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, index) => (
            <tr key={`${line.name}-${index}`} className="border-b border-dashed border-gray-400 align-top">
              <td className="py-1 pr-1">
                {line.name}
                {line.warranty && (
                  <small className="block font-bold text-[9px]">
                    {line.warrantyUntil ? "✔ " : ""}{line.warranty}
                    {line.warrantyUntil && <> ({t.until} {new Date(line.warrantyUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})</>}
                  </small>
                )}
                {line.imeis && line.imeis.length > 0 && <small className="block font-mono text-[9px]">IMEI: {line.imeis.join(", ")}</small>}
                {line.note && <small className="block text-[9px] text-gray-600">{t.note}: {line.note}</small>}
              </td>
              <td className="py-1 pl-1 text-center tabular-nums">{line.quantity}</td>
              <td className="whitespace-nowrap py-1 pl-1.5 text-right tabular-nums">{line.unitPrice === 0 ? t.foc : money(line.unitPrice)}</td>
              <td className="whitespace-nowrap py-1 pl-1.5 text-right tabular-nums">{line.unitPrice === 0 ? t.foc : money(line.quantity * line.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1.5">
        <div className={row}><span className="text-gray-600">{t.subtotal}</span><b className="tabular-nums">{money(data.subtotal)}</b></div>
        {data.discount > 0 && <div className={row}><span className="text-gray-600">{t.discount}</span><b className="tabular-nums">-{money(data.discount)}</b></div>}
        <div className={`${row} mt-0.5 border-t-2 border-black pt-1 text-[12px] font-bold`}>
          <span>{t.total}</span><span className="tabular-nums">{`${money(data.total)} ${cur}`}</span>
        </div>
        <div className={row}><span className="text-gray-600">{t.paid}</span><b className="tabular-nums">{money(data.paid)}</b></div>
        {data.change > 0 && <div className={row}><span className="text-gray-600">{t.change}</span><b className="tabular-nums">{money(data.change)}</b></div>}
        {data.credit > 0 && <div className={`${row} font-bold`}><span>{t.owing}</span><span className="tabular-nums">{money(data.credit)}</span></div>}
        <div className={row}><span className="text-gray-600">{t.customer}</span><b>{data.customerName || t.walkIn}</b></div>
      </div>

      <div className={`mt-2 pt-1.5 text-center ${rule}`}>{t.thanks}</div>
    </div>
  );
}

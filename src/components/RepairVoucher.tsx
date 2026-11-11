"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { fmtDateTime } from "@/lib/format";
import type { AppLanguage } from "@/lib/currency";
import type { RepairStatus } from "@/lib/repairStatus";
import { voucherText } from "@/lib/repairVoucherText";
import { usePrintSlip } from "@/lib/usePrintSlip";

/** The slip handed to the customer when a device is taken in, and again whenever asked. */
export interface RepairVoucherData {
  jobNo: string;
  at: string;
  shopName: string;
  /** Settings → Business logo, as a data URL. */
  shopLogo?: string;
  shopPhone?: string;
  shopAddress?: string;
  customerName?: string;
  customerPhone?: string;
  deviceBrand: string;
  deviceModel: string;
  imei?: string;
  accessories?: string;
  problem: string;
  status: string;
  /** When the phone was handed back. A delivered job prints as the customer's receipt. */
  deliveredAt?: string;
  /** Whole units of the shop's main currency. */
  estimatedCost: number;
  finalCost: number;
  paidAmount: number;
  /** The shop's main currency, printed after each amount. MMK when not given. */
  currency?: string;
  /** The language the voucher is written in: the shop's, not the screen's. Myanmar when not given. */
  language?: AppLanguage;
  /** The staff member who took the device in, printed over the receiver's signature line. */
  receivedByName?: string;
  /** Where the QR on the voucher points: the customer's status page. */
  trackUrl?: string;
  /** From Settings → Repair voucher; the defaults apply when a shop has not set them. */
  tagline?: string;
  terms?: string[];
  qrCaption?: string;
}

const money = (value: number) => Math.round(value).toLocaleString("en-US");

/** The printed copy: sized for a 58mm roll like the sale slip, and printed through the
 *  same stylesheet. Portalled to <body> so that stylesheet can isolate it, as SaleReceipt
 *  explains; the on-screen preview is a separate RepairVoucherSlip. */
export function RepairVoucher({ data }: { data: RepairVoucherData }) {
  usePrintSlip();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div id="repair-voucher" className="hidden print:block">
      <RepairVoucherSlip data={data} />
    </div>,
    document.body
  );
}

/** The voucher itself, used both for printing and to show the counter what will print. */
export function RepairVoucherSlip({ data }: { data: RepairVoucherData }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (data.trackUrl) {
      QRCode.toDataURL(data.trackUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" })
        .then((url) => { if (live) setQr(url); })
        .catch(() => { if (live) setQr(null); });
    }
    return () => { live = false; };
  }, [data.trackUrl]);

  const t = voucherText(data.language);
  const cur = data.currency ?? "MMK";
  const balance = Math.max(0, data.finalCost - data.paidAmount);
  // Once the phone is back with its owner the slip is their receipt: what was done and
  // paid, without the drop-off warnings, the tracking QR or the signature lines.
  const receipt = data.status === "DELIVERED";
  const terms = receipt ? [] : data.terms ?? t.terms;
  const qrCaption = data.qrCaption ?? t.qrCaption;

  const row = "flex justify-between gap-2 py-[1px]";
  const label = "text-gray-600";
  const device = [data.deviceBrand, data.deviceModel].filter(Boolean).join(" ");
  // Laid out like the multishop app's repair voucher: name and title up top, the voucher
  // details between dashed rules, the device in a two-column table, and a ruled balance.
  const details: [string, React.ReactNode][] = [
    [t.device, device || "-"],
    ...(data.imei ? [[t.imei, <span key="imei" className="font-mono">{data.imei}</span>] as [string, React.ReactNode]] : []),
    [t.problem, data.problem || "-"],
    ...(data.accessories ? [[t.accessories, data.accessories] as [string, React.ReactNode]] : []),
    [t.status, <b key="status">{t.statuses[data.status as RepairStatus] ?? data.status}</b>],
  ];
  const collectedSub = [t.collectedSub, data.deliveredAt ? fmtDateTime(data.deliveredAt) : ""].filter(Boolean).join(" · ");

  return (
      // overflow-wrap:anywhere: a long run with no spaces (an email, an Apple ID) wraps
      // instead of widening the slip past the paper and losing its end.
      // data-no-i18n: the voucher is in the shop's language, so the screen's language pass
      // (and its MMK-to-currency swap) leaves it alone.
      <div data-no-i18n className="w-full max-w-[58mm] px-1 text-[10px] leading-snug text-black [overflow-wrap:anywhere]" style={{ fontFamily: "Arial, 'Pyidaungsu', 'Myanmar Text', sans-serif" }}>
        <div className="text-center">
          {data.shopLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
            <img src={data.shopLogo} alt="" className="slip-logo mx-auto mb-1 max-h-[14mm] max-w-[46mm] object-contain" />
          )}
          <div className="text-[14px] font-bold leading-tight">{data.shopName}</div>
          <div className="mt-0.5">{receipt ? t.receiptTitle : t.voucherTitle}</div>
          {data.tagline && <div className={label}>{data.tagline}</div>}
          {(data.shopPhone || data.shopAddress) && (
            <div className={label}>{[data.shopPhone, data.shopAddress].filter(Boolean).join(" · ")}</div>
          )}
        </div>

        {receipt && (
          // Boxed and big, so anyone reading it sees at once the phone has gone home.
          <div className="mx-auto mt-1.5 w-fit rounded border-2 border-black px-3 py-1 text-center">
            <div className="text-[15px] font-bold">{t.collected}</div>
            {collectedSub && <div className="text-[9px] font-bold uppercase">{collectedSub}</div>}
          </div>
        )}

        <div className="my-1.5 border-y border-dashed border-gray-500 py-1">
          <div className={row}><span className={label}>{t.voucherNo}</span><b className="text-[12px]">{data.jobNo}</b></div>
          <div className={row}><span className={label}>{t.receivedDate}</span><b>{fmtDateTime(data.at)}</b></div>
          {receipt && data.deliveredAt && <div className={row}><span className={label}>{t.deliveredDate}</span><b>{fmtDateTime(data.deliveredAt)}</b></div>}
          {data.customerName && <div className={row}><span className={label}>{t.name}</span><b>{data.customerName}</b></div>}
          {data.customerPhone && <div className={row}><span className={label}>{t.phone}</span><b>{data.customerPhone}</b></div>}
        </div>

        <table className="w-full table-fixed border-collapse">
          <tbody>
            {details.map(([k, v]) => (
              <tr key={k} className="border-b border-dashed border-gray-400 align-top">
                <th className="w-[38%] py-1 pr-1 text-left font-bold">{k}</th>
                <td className="py-1">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1.5">
          {data.finalCost > 0 ? (
            <>
              <div className={row}><span className={label}>{t.charge}</span><b className="tabular-nums">{`${money(data.finalCost)} ${cur}`}</b></div>
              {data.paidAmount > 0 && <div className={row}><span className={label}>{t.paid}</span><b className="tabular-nums">{`${money(data.paidAmount)} ${cur}`}</b></div>}
              {balance > 0 && (
                <div className={`${row} mt-0.5 border-t-2 border-black pt-1 text-[12px] font-bold`}>
                  <span>{t.balance}</span><span className="tabular-nums">{`${money(balance)} ${cur}`}</span>
                </div>
              )}
              {balance === 0 && (
                // Printed big and boxed, so whoever hands the phone back sees at a glance
                // that there is nothing left to take.
                <div className="mx-auto mt-1.5 w-fit rounded border-2 border-black px-3 py-0.5 text-center text-[14px] font-bold">
                  {t.settled}
                </div>
              )}
            </>
          ) : (
            <>
              {data.estimatedCost > 0 ? (
                <div className={row}><span className={label}>{t.estimated}</span><b className="tabular-nums">{`${money(data.estimatedCost)} ${cur}`}</b></div>
              ) : (
                <div>{`${t.charge} — ${t.toConfirm}`}</div>
              )}
              {data.paidAmount > 0 && <div className={row}><span className={label}>{t.deposit}</span><b className="tabular-nums">{`${money(data.paidAmount)} ${cur}`}</b></div>}
              {data.estimatedCost > 0 && (
                <div className={`${row} mt-0.5 border-t-2 border-black pt-1 text-[12px] font-bold`}>
                  <span>{t.balance}</span><span className="tabular-nums">{`${money(Math.max(0, data.estimatedCost - data.paidAmount))} ${cur}`}</span>
                </div>
              )}
            </>
          )}
        </div>

        {terms.length > 0 && (
          <div className="mt-2 border-t border-dashed border-gray-500 pt-1.5">
            <div className="text-center font-bold">{t.notice}</div>
            <ul className="list-disc pl-3 text-[9px]">
              {terms.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}

        {receipt && <div className="mt-2 text-center font-bold">{t.thanks}</div>}

        {!receipt && qr && data.trackUrl && (
          <div className="mt-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise */}
            <img src={qr} alt="" className="mx-auto h-[30mm] w-[30mm]" />
            {qrCaption && <div>{qrCaption}</div>}
          </div>
        )}

        {!receipt && <div className="mt-6 flex items-end justify-between">
          <div className="text-center">
            {data.receivedByName && <div className="font-bold uppercase">{data.receivedByName}</div>}
            <div className="border-t border-black px-1">{t.receiver}</div>
          </div>
          <div className="border-t border-black px-1">{t.collector}</div>
        </div>}
      </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { fmtDateTime } from "@/lib/format";
import { REPAIR_STATUS_MM } from "@/lib/repairStatus";
import { DEFAULT_REPAIR_VOUCHER } from "@/lib/repairVoucherSettings";
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
  /** Whole kyat. */
  estimatedCost: number;
  finalCost: number;
  paidAmount: number;
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

  const balance = Math.max(0, data.finalCost - data.paidAmount);
  const terms = data.terms ?? DEFAULT_REPAIR_VOUCHER.terms;
  const qrCaption = data.qrCaption ?? DEFAULT_REPAIR_VOUCHER.qrCaption;

  const row = "flex justify-between gap-2 py-[1px]";
  const label = "text-gray-600";
  const device = [data.deviceBrand, data.deviceModel].filter(Boolean).join(" ");
  // Laid out like the multishop app's repair voucher: name and title up top, the voucher
  // details between dashed rules, the device in a two-column table, and a ruled balance.
  const details: [string, React.ReactNode][] = [
    ["ဖုန်း", device || "-"],
    ...(data.imei ? [["IMEI", <span key="imei" className="font-mono">{data.imei}</span>] as [string, React.ReactNode]] : []),
    ["ပြင်ရန်", data.problem || "-"],
    ...(data.accessories ? [["ပါလာသည်", data.accessories] as [string, React.ReactNode]] : []),
    ["အခြေအနေ", <b key="status">{REPAIR_STATUS_MM[data.status] ?? data.status}</b>],
  ];

  return (
      <div className="w-full max-w-[58mm] px-1 text-[10px] leading-snug text-black" style={{ fontFamily: "Arial, 'Pyidaungsu', 'Myanmar Text', sans-serif" }}>
        <div className="text-center">
          {data.shopLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
            <img src={data.shopLogo} alt="" className="mx-auto mb-1 max-h-[14mm] max-w-[46mm] object-contain" />
          )}
          <div className="text-[14px] font-bold leading-tight">{data.shopName}</div>
          <div className="mt-0.5">Repair Voucher</div>
          {data.tagline && <div className={label}>{data.tagline}</div>}
          {(data.shopPhone || data.shopAddress) && (
            <div className={label}>{[data.shopPhone, data.shopAddress].filter(Boolean).join(" · ")}</div>
          )}
        </div>

        <div className="my-1.5 border-y border-dashed border-gray-500 py-1">
          <div className={row}><span className={label}>ဘောက်ချာနံပါတ်</span><b className="text-[12px]">{data.jobNo}</b></div>
          <div className={row}><span className={label}>လက်ခံရက်</span><b>{fmtDateTime(data.at)}</b></div>
          {data.customerName && <div className={row}><span className={label}>နာမည်</span><b>{data.customerName}</b></div>}
          {data.customerPhone && <div className={row}><span className={label}>ဖုန်းနံပါတ်</span><b>{data.customerPhone}</b></div>}
        </div>

        <table className="w-full border-collapse">
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
              <div className={row}><span className={label}>ကျသင့်ငွေ</span><b className="tabular-nums">{money(data.finalCost)} MMK</b></div>
              {data.paidAmount > 0 && <div className={row}><span className={label}>ပေးပြီး</span><b className="tabular-nums">{money(data.paidAmount)} MMK</b></div>}
              {balance > 0 && (
                <div className={`${row} mt-0.5 border-t-2 border-black pt-1 text-[12px] font-bold`}>
                  <span>ကျန်ငွေ</span><span className="tabular-nums">{money(balance)} MMK</span>
                </div>
              )}
              {balance === 0 && (
                // Printed big and boxed, so whoever hands the phone back sees at a glance
                // that there is nothing left to take.
                <div className="mx-auto mt-1.5 w-fit rounded border-2 border-black px-3 py-0.5 text-center text-[14px] font-bold">
                  ✔ ရှင်းပြီး
                </div>
              )}
            </>
          ) : (
            <>
              {data.estimatedCost > 0 ? (
                <div className={row}><span className={label}>ခန့်မှန်းကျသင့်ငွေ</span><b className="tabular-nums">{money(data.estimatedCost)} MMK</b></div>
              ) : (
                <div>ကျသင့်ငွေ — စစ်ဆေးပြီးမှ အတည်ပြုပါမည်။</div>
              )}
              {data.paidAmount > 0 && <div className={row}><span className={label}>စရံငွေ</span><b className="tabular-nums">{money(data.paidAmount)} MMK</b></div>}
              {data.estimatedCost > 0 && (
                <div className={`${row} mt-0.5 border-t-2 border-black pt-1 text-[12px] font-bold`}>
                  <span>ကျန်ငွေ</span><span className="tabular-nums">{money(Math.max(0, data.estimatedCost - data.paidAmount))} MMK</span>
                </div>
              )}
            </>
          )}
        </div>

        {terms.length > 0 && (
          <div className="mt-2 border-t border-dashed border-gray-500 pt-1.5">
            <div className="text-center font-bold">⚠ သတိပြုရန် ⚠</div>
            <ul className="list-disc pl-3 text-[9px]">
              {terms.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}

        {qr && data.trackUrl && (
          <div className="mt-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise */}
            <img src={qr} alt="" className="mx-auto h-[30mm] w-[30mm]" />
            {qrCaption && <div>{qrCaption}</div>}
          </div>
        )}

        <div className="mt-6 flex items-end justify-between">
          <div className="text-center">
            {data.receivedByName && <div className="font-bold uppercase">{data.receivedByName}</div>}
            <div className="border-t border-black px-1">လက်ခံသူ</div>
          </div>
          <div className="border-t border-black px-1">ရွေးယူသူ</div>
        </div>
      </div>
  );
}

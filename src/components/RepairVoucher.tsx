"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { fmtDateTime } from "@/lib/format";
import { centre, row, wrap, WIDTH_58MM } from "@/lib/thermalReceipt";
import { REPAIR_STATUS_MM } from "@/lib/repairStatus";
import { DEFAULT_REPAIR_VOUCHER } from "@/lib/repairVoucherSettings";

/** The slip handed to the customer when a device is taken in, and again whenever asked. */
export interface RepairVoucherData {
  jobNo: string;
  at: string;
  shopName: string;
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

  return (
      <div className="w-full max-w-[58mm] px-1 text-[10px] leading-snug text-black">
        <div className="text-center">
          <div className="text-[13px] font-bold">{data.shopName}</div>
          {data.tagline && <div>{data.tagline}</div>}
          {(data.shopPhone || data.shopAddress) && (
            <div>{[data.shopPhone, data.shopAddress].filter(Boolean).join(" · ")}</div>
          )}
        </div>

        <div className="my-1 border-t border-dashed border-black" />

        <div className="text-center">
          <div>ဘောက်ချာနံပါတ်</div>
          <div className="font-mono text-[14px] font-bold">{data.jobNo}</div>
          <div>{fmtDateTime(data.at)}</div>
        </div>

        <div className="my-1 border-t border-dashed border-black" />

        {data.customerName && <div>နာမည်: {data.customerName}</div>}
        {data.customerPhone && <div>ဖုန်း: {data.customerPhone}</div>}
        <div>ဖုန်းအမျိုးအစား: {data.deviceBrand}</div>
        <div>မော်ဒယ်: {data.deviceModel}</div>
        {data.imei && <div className="font-mono">IMEI: {data.imei}</div>}
        <div>ပြင်ရန်: {data.problem}</div>
        {data.accessories && <div>ပါလာသည်: {data.accessories}</div>}
        <div>အခြေအနေ: <b>{REPAIR_STATUS_MM[data.status] ?? data.status}</b></div>

        <div className="my-1 border-t border-dashed border-black" />

        {data.finalCost > 0 ? (
          <>
            <div className="flex justify-between"><span>ကျသင့်ငွေ</span><b>{money(data.finalCost)}</b></div>
            {data.paidAmount > 0 && <div className="flex justify-between"><span>ပေးပြီး</span><span>{money(data.paidAmount)}</span></div>}
            {balance > 0 && <div className="flex justify-between font-bold"><span>ကျန်ငွေ</span><span>{money(balance)}</span></div>}
            {balance === 0 && (
              // Printed big and boxed, so whoever hands the phone back sees at a glance
              // that there is nothing left to take.
              <div className="mx-auto mt-1 w-fit rounded border-2 border-black px-3 py-0.5 text-center text-[14px] font-bold">
                ✔ ရှင်းပြီး
              </div>
            )}
          </>
        ) : (
          <>
            {data.estimatedCost > 0 ? (
              <div className="flex justify-between"><span>ခန့်မှန်းကျသင့်ငွေ</span><b>{money(data.estimatedCost)}</b></div>
            ) : (
              <div>ကျသင့်ငွေ — စစ်ဆေးပြီးမှ အတည်ပြုပါမည်။</div>
            )}
            {data.paidAmount > 0 && <div className="flex justify-between"><span>စရံငွေ</span><span>{money(data.paidAmount)}</span></div>}
          </>
        )}

        {terms.length > 0 && (
          <>
            <div className="my-1 border-t border-dashed border-black" />
            <div className="text-center font-bold">⚠ သတိပြုရန် ⚠</div>
            <ul className="list-disc pl-3">
              {terms.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </>
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

/** The voucher as plain text for RawBT. Kept in English: roll printers have no Myanmar font. */
export function buildRepairTextVoucher(data: RepairVoucherData, width = WIDTH_58MM): string {
  const rule = "-".repeat(width);
  const lines: string[] = [];
  lines.push(centre(data.shopName, width));
  if (data.shopPhone) lines.push(centre(data.shopPhone, width));
  if (data.shopAddress) for (const part of wrap(data.shopAddress, width)) lines.push(centre(part, width));
  lines.push(rule);
  lines.push(centre("REPAIR VOUCHER", width));
  lines.push(centre(data.jobNo, width));
  lines.push(new Date(data.at).toLocaleString("en-GB", { hour12: false }));
  lines.push(rule);
  if (data.customerName) lines.push(`Name: ${data.customerName}`);
  if (data.customerPhone) lines.push(`Phone: ${data.customerPhone}`);
  lines.push(`Device: ${data.deviceBrand} ${data.deviceModel}`);
  if (data.imei) lines.push(`IMEI: ${data.imei}`);
  for (const part of wrap(`Problem: ${data.problem}`, width)) lines.push(part);
  if (data.accessories) for (const part of wrap(`With: ${data.accessories}`, width)) lines.push(part);
  lines.push(`Status: ${data.status.replace(/_/g, " ")}`);
  lines.push(rule);
  if (data.finalCost > 0) {
    lines.push(row("Charge", money(data.finalCost), width));
    if (data.paidAmount > 0) lines.push(row("Paid", money(data.paidAmount), width));
    const balance = data.finalCost - data.paidAmount;
    if (balance > 0) lines.push(row("Balance", money(balance), width));
    else lines.push(centre("*** PAID ***", width));
  } else {
    lines.push(data.estimatedCost > 0 ? row("Estimate", money(data.estimatedCost), width) : "Charge confirmed after check");
    if (data.paidAmount > 0) lines.push(row("Deposit", money(data.paidAmount), width));
  }
  lines.push(rule);
  lines.push(...wrap("Keep this voucher. The device is released only to the owner or on this voucher.", width));
  if (data.receivedByName) lines.push("", `Received by: ${data.receivedByName}`);
  lines.push("", "", "");
  return lines.join("\n");
}

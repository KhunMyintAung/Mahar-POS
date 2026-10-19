"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDateTime } from "@/lib/format";
import { centre, row, wrap, WIDTH_58MM } from "@/lib/thermalReceipt";

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
}

export const REPAIR_STATUS_MM: Record<string, string> = {
  RECEIVED: "လက်ခံပြီး",
  IN_PROGRESS: "ပြင်ဆင်နေဆဲ",
  WAITING_PARTS: "ပစ္စည်းစောင့်နေဆဲ",
  DONE: "ပြင်ပြီး",
  DELIVERED: "ပြန်ပေးပြီး",
  CANCELLED: "ပယ်ဖျက်ပြီး",
};

const TERMS_MM = [
  "အရေးကြီး ဆင်းကဒ်များ မိမိကိုယ်တိုင် သိမ်းဆည်းရန်။",
  "ဖုန်းအတွင်း အရေးကြီးဖိုင်၊ အဆက်အသွယ်များ မပြင်မီ ကြိုပြောရန်။",
  "ဖုန်းကာဗာများနှင့် အခြားဆက်စပ်ပစ္စည်းပါလာပါက ပြန်တောင်းယူရန်။",
  "အထက်ပါအကြောင်းကြောင့် ပျောက်ဆုံးပျက်စီးပါက တာဝန်မယူပါ။",
  "တစ်လကျော် အပ်နှံပစ္စည်းများ တာဝန်မယူပါ။",
  "ဖုန်းလာရွေးသူမှာ ကိုယ်တိုင်မဟုတ်ပါက လက်ခံ Voucher ပါမှသာ ဖုန်းထုတ်ပေးပါသည်။",
];

const money = (value: number) => Math.round(value).toLocaleString("en-US");

/** Sized for a 58mm roll like the sale slip, and printed through the same stylesheet. */
export function RepairVoucher({ data }: { data: RepairVoucherData }) {
  // Portalled to <body> for the print stylesheet, as SaleReceipt explains.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!mounted) return null;

  const balance = Math.max(0, data.finalCost - data.paidAmount);

  return createPortal(
    <div id="repair-voucher" className="hidden print:block">
      <div className="w-full max-w-[58mm] px-1 text-[10px] leading-snug text-black">
        <div className="text-center">
          <div className="text-[13px] font-bold">{data.shopName}</div>
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

        <div className="my-1 border-t border-dashed border-black" />

        <div className="text-center font-bold">⚠ သတိပြုရန် ⚠</div>
        <ul className="list-disc pl-3">
          {TERMS_MM.map((t) => <li key={t}>{t}</li>)}
        </ul>

        <div className="mt-6 flex justify-between">
          <span className="border-t border-black px-1">လက်ခံသူ</span>
          <span className="border-t border-black px-1">ရွေးယူသူ</span>
        </div>
      </div>
    </div>,
    document.body
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
  lines.push(`Status: ${data.status.replace("_", " ")}`);
  lines.push(rule);
  if (data.finalCost > 0) {
    lines.push(row("Charge", money(data.finalCost), width));
    if (data.paidAmount > 0) lines.push(row("Paid", money(data.paidAmount), width));
    const balance = data.finalCost - data.paidAmount;
    if (balance > 0) lines.push(row("Balance", money(balance), width));
  } else {
    lines.push(data.estimatedCost > 0 ? row("Estimate", money(data.estimatedCost), width) : "Charge confirmed after check");
    if (data.paidAmount > 0) lines.push(row("Deposit", money(data.paidAmount), width));
  }
  lines.push(rule);
  lines.push(...wrap("Keep this voucher. The device is released only to the owner or on this voucher.", width));
  lines.push("", "", "");
  return lines.join("\n");
}

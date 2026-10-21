"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { printElement } from "@/lib/printReceipt";
import { DEFAULT_WARRANTY, WARRANTY_SETTING, parseWarrantySettings } from "@/lib/warranty";
import { Button, Modal } from "@/components/ui";
import type { ReceiptData } from "@/components/SaleReceipt";

/** Preview the warranty cards for a sale and print them, on their own. */
export function WarrantyCardDialog({ receipt, onClose }: { receipt: ReceiptData | null; onClose: () => void }) {
  const [terms, setTerms] = useState({ NEW: DEFAULT_WARRANTY.newTerms, SECOND: DEFAULT_WARRANTY.secondTerms });
  const slip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!receipt) return;
    api<{ settings: Record<string, unknown> }>(`/api/v1/settings?key=${WARRANTY_SETTING}`)
      .then((d) => {
        const s = parseWarrantySettings(d.settings[WARRANTY_SETTING]);
        setTerms({ NEW: s.newTerms, SECOND: s.secondTerms });
      })
      .catch(() => {});
  }, [receipt]);

  return (
    <Modal open={Boolean(receipt)} onClose={onClose} title="Warranty card">
      {receipt && (
        <div className="space-y-3">
          <div className="max-h-[55vh] overflow-y-auto rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <div ref={slip} className="mx-auto w-[58mm] max-w-full bg-white py-2 shadow">
              <WarrantyCardSlip receipt={receipt} terms={terms} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { const el = slip.current?.firstElementChild; if (el) void printElement(el); }}>
              <Printer size={16} className="mr-1 inline" />Print warranty card
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** The lines of a sale that carry a warranty with a length, each of which gets its own
 *  card. "No warranty" is printed on the receipt but has nothing to put on a card. */
export function warrantyLines(receipt: ReceiptData) {
  return receipt.lines.filter((line) => line.warranty && line.warrantyUntil);
}

const money = (value: number) => Math.round(value).toLocaleString("en-US");
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A warranty card per phone sold with a warranty, separate from the sale receipt: the
 *  customer keeps it as proof of cover, with the shop's own terms for a new or a
 *  second-hand phone. Several phones in one sale give several cards, each on its own page. */
export function WarrantyCardSlip({ receipt, terms }: {
  receipt: ReceiptData;
  terms: { NEW: string; SECOND: string };
}) {
  return (
    <div className="w-full max-w-[58mm] text-black">
      {warrantyLines(receipt).map((line, index) => {
        const [heading, ...body] = (line.warrantyCondition === "SECOND" ? terms.SECOND : terms.NEW)
          .split("\n").map((l) => l.trim()).filter(Boolean);
        return (
          <div key={index} className="px-1 text-[10px] leading-snug [&:not(:last-child)]:break-after-page [&:not(:last-child)]:pb-4">
            <div className="text-center">
              {receipt.shopLogo && (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
                <img src={receipt.shopLogo} alt="" className="slip-logo mx-auto mb-1 max-h-[18mm] max-w-[46mm] object-contain" />
              )}
              <div className="text-[13px] font-bold">{receipt.shopName}</div>
              {(receipt.shopPhone || receipt.shopAddress) && (
                <div>{[receipt.shopPhone, receipt.shopAddress].filter(Boolean).join(" · ")}</div>
              )}
              <div className="mt-1 text-[12px] font-bold">WARRANTY CARD</div>
            </div>

            <div className="my-1 border-t border-dashed border-black" />

            <div className="flex justify-between"><span>Voucher</span><b className="font-mono">{receipt.txnNo}</b></div>
            <div className="flex justify-between"><span>Date</span><span>{fmtDateTime(receipt.at)}</span></div>
            {receipt.customerName && <div className="flex justify-between"><span>Customer</span><span>{receipt.customerName}</span></div>}
            <div className="mt-1 text-[12px] font-bold">{line.name}</div>
            <div className="flex justify-between"><span>Price</span><span>{money(line.unitPrice)} MMK</span></div>
            {line.note && <div>Note: {line.note}</div>}

            <div className="mx-auto my-1.5 w-fit rounded border-2 border-black px-2 py-0.5 text-center font-bold">
              ✔ {line.warranty}
              {line.warrantyUntil && <div className="text-[9px] font-normal">until {day(line.warrantyUntil)}</div>}
            </div>

            {heading && (
              <>
                <div className="my-1 border-t border-dashed border-black" />
                <div className="text-center font-bold">{heading}</div>
                {body.map((text, i) => (
                  <div key={i} className={/^[၀-၉0-9]+[။.]/.test(text) ? "mt-1 font-bold" : ""}>{text}</div>
                ))}
              </>
            )}

            <div className="mt-6 flex items-end justify-between">
              <div className="text-center">
                {receipt.cashierName && <div className="font-bold uppercase">{receipt.cashierName}</div>}
                <div className="border-t border-black px-1">ရောင်းသူ</div>
              </div>
              <div className="border-t border-black px-1">ဝယ်သူ</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

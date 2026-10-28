"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Card, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { printSaleReceipt } from "@/lib/slipPrint";
import { getPaperWidth, setPaperWidth, type PaperWidth } from "@/lib/printSettings";

/** Settings → Printing: which roll this device's receipt printer takes, with a test slip
 *  that shows whether the print reaches both edges. */
export function PrinterPaperCard() {
  const [width, setWidth] = useState<PaperWidth>(58);
  const { me, phoneShop } = useAuth();
  const { push } = useToast();

  // Read after mount: the choice lives in this browser, which the server cannot see.
  useEffect(() => {
    const timer = window.setTimeout(() => setWidth(getPaperWidth()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function choose(next: PaperWidth) {
    setPaperWidth(next);
    setWidth(next);
    push(next === 80 ? "80mm paper (XP-80C and similar)" : "58mm paper");
  }

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Receipt printer paper</h3>
        <p className="mt-1 text-xs text-gray-500">{phoneShop ? "For the printer on this device. Every voucher, receipt and warranty card is sized to it." : "For the printer on this device. Every receipt is sized to it."}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([58, 80] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => choose(w)}
            className={cn(
              "rounded-lg border-2 px-3 py-3 text-left transition",
              width === w ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
            )}
          >
            <div className="text-base font-bold">{w}mm</div>
            <div className="text-xs text-gray-500">{w === 80 ? "XP-80C, XP-A300M, most counter printers" : "Small Bluetooth and phone printers"}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => {
          printSaleReceipt({
            txnNo: "TEST-0001", at: new Date().toISOString(),
            shopName: me?.business?.name ?? "Mahar Mini POS", shopLogo: me?.business?.logoUrl ?? undefined,
            shopPhone: me?.business?.phone ?? undefined, shopAddress: me?.business?.address ?? undefined,
            cashierName: me?.user.name, customerName: undefined,
            lines: [{ name: `Test print · ${width}mm paper`, quantity: 1, unitPrice: 10000 }, { name: "Sample item with a longer name", quantity: 2, unitPrice: 2500 }],
            subtotal: 15000, discount: 0, total: 15000, paid: 15000, change: 0, credit: 0,
          });
        }}>
          <Printer size={16} className="mr-1 inline" />Test print
        </Button>
        <p className="text-xs text-gray-500">In the print window choose the printer and keep Margins on Default and Scale on 100%. Allow pop-ups for this site if the print window does not open.</p>
      </div>

    </Card>
  );
}

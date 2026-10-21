"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Card, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { printElement } from "@/lib/printReceipt";
import { getFit72, getPaperWidth, setFit72, setPaperWidth, type PaperWidth } from "@/lib/printSettings";

/** Settings → Printing: which roll this device's receipt printer takes, with a test slip
 *  that shows whether the print reaches both edges. */
export function PrinterPaperCard() {
  const [width, setWidth] = useState<PaperWidth>(58);
  const [fit72, setFit] = useState(false);
  const sample = useRef<HTMLDivElement>(null);
  const { me } = useAuth();
  const { push } = useToast();

  // Read after mount: the choice lives in this browser, which the server cannot see.
  useEffect(() => {
    const timer = window.setTimeout(() => { setWidth(getPaperWidth()); setFit(getFit72()); }, 0);
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
        <p className="mt-1 text-xs text-gray-500">For the printer on this device. Every voucher, receipt and warranty card is sized to it.</p>
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
      {width === 80 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={fit72} onChange={(e) => { setFit72(e.target.checked); setFit(e.target.checked); }} />
          <span>
            <span className="font-medium">Edges cut off? Print 72mm wide</span>
            <span className="block text-xs text-gray-500">The slip fills the full 80mm. Tick this only if the left or right edge is missing on paper.</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => { if (sample.current) void printElement(sample.current); }}>
          <Printer size={16} className="mr-1 inline" />Test print
        </Button>
        <p className="text-xs text-gray-500">In the print window choose the printer, set Margins to None and Scale to 100%.</p>
      </div>

      {/* The test slip: a box that should touch both edges of the printable width. */}
      <div className="hidden">
        <div ref={sample} className="w-full max-w-[58mm] px-1 text-[10px] leading-snug text-black">
          <div className="border-2 border-black p-1 text-center">
            <div className="text-[13px] font-bold">{me?.business?.name ?? "Mahar Mini POS"}</div>
            <div>Test print · {width === 80 && fit72 ? "72" : width}mm</div>
          </div>
          <div className="mt-1 flex justify-between"><span>Item</span><span>Amount</span></div>
          <div className="flex justify-between"><span>Sample item × 1</span><span>10,000</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>10,000 MMK</span></div>
          <div className="mt-1 text-center">The box above should reach both edges of the paper.</div>
        </div>
      </div>
    </Card>
  );
}

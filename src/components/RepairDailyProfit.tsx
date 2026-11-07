"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Empty, Input, Modal, Spinner, cn, useToast } from "@/components/ui";

interface Daily {
  date: string; parts: "stock" | "job";
  jobs: { id: string; jobNo: string; who: string; device: string; technician: string | null; charge: string; partsCost: string; profit: string }[];
  byTechnician: { technician: string | null; count: number; charge: string; parts: string; profit: string }[];
  total: { count: number; charge: string; parts: string; profit: string };
  /** The day in all: repair income less repair expenses (and per-job parts when bought per job). */
  day: { charge: string; otherIncome: string; income: string; parts: string; expense: string; profit: string };
}

const today = () => new Date(Date.now() + 390 * 60_000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Repairs paid on a day: charge, parts cost and profit per job, per technician and in all. */
export function RepairDailyProfit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Daily | null>(null);
  const { push } = useToast();
  useEffect(() => {
    if (!open) return;
    let live = true;
    api<Daily>(`/api/v1/repairs/daily?date=${date}`).then((d) => { if (live) setData(d); }).catch((e) => push(e.message, "error"));
    return () => { live = false; };
  }, [open, date, push]);
  const shown = data?.date === date ? data : null;
  const tone = (v: string) => (BigInt(v) < 0n ? "text-red-600" : "text-emerald-700 dark:text-emerald-300");

  return (
    <Modal open={open} onClose={onClose} title="Daily repair profit" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-3">
        <div className="flex items-end gap-1">
          <Button size="sm" variant="ghost" aria-label="Day before" onClick={() => setDate(shift(date, -1))}><ChevronLeft size={16} /></Button>
          <div className="w-40"><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
          <Button size="sm" variant="ghost" aria-label="Day after" disabled={date >= today()} onClick={() => setDate(shift(date, 1))}><ChevronRight size={16} /></Button>
        </div>
        {!shown ? <Spinner /> : shown.jobs.length === 0 && shown.day.income === "0" && shown.day.expense === "0" ? <Empty message="No repair was paid this day" /> : (
          <>
            {/* The day: repair income, less repair expenses, is the profit. */}
            <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
              <div className="flex justify-between"><span>Repair income</span><b className="tabular-nums">{fmtMoney(shown.day.income)}</b></div>
              {shown.day.otherIncome !== "0" && (
                <div className="flex justify-between pl-3 text-xs text-gray-500"><span>{`Repairs paid ${fmtMoney(shown.day.charge)} · Other income ${fmtMoney(shown.day.otherIncome)}`}</span></div>
              )}
              {shown.day.parts !== "0" && (
                <div className="flex justify-between"><span>Parts cost</span><span className="tabular-nums">{`− ${fmtMoney(shown.day.parts)}`}</span></div>
              )}
              <div className="flex justify-between"><span>Repair expense</span><span className="tabular-nums">{`− ${fmtMoney(shown.day.expense)}`}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 dark:border-gray-700">
                <span className="font-semibold">Profit</span><b className={cn("tabular-nums", tone(shown.day.profit))}>{fmtMoney(shown.day.profit)}</b>
              </div>
            </div>
            {shown.byTechnician.length > 1 || shown.byTechnician[0]?.technician ? (
              <div className="space-y-0.5 text-sm">
                <div className="text-xs font-semibold text-gray-500">By technician</div>
                {shown.byTechnician.map((t) => (
                  <div key={t.technician ?? "-"} className="flex justify-between gap-2">
                    <span>{`${t.technician ?? "No technician"} · ${t.count}`}</span>
                    <span className={cn("font-semibold tabular-nums", tone(t.profit))}>{fmtMoney(t.profit)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {shown.jobs.map((j) => (
                <div key={j.id} className="flex items-start justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{`${j.jobNo} · ${j.device}`}</div>
                    <div className="truncate text-xs text-gray-500">{[j.technician, `${fmtMoney(j.charge)} − ${fmtMoney(j.partsCost)}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span className={cn("shrink-0 font-semibold tabular-nums", tone(j.profit))}>{fmtMoney(j.profit)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">{shown.parts === "job"
              ? "Parts bought per job: this cost comes off service profit in Reports."
              : "Parts from stock: their cost counted when bought (Service purchase), so Reports do not count it again."}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

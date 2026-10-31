"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Button, Input, Modal, Select, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { REPAIR_STATUS_LABELS, REPAIR_STATUS_MM, type RepairStatus } from "@/lib/repairStatus";
import { printRepairVoucher } from "@/lib/slipPrint";
import { playSuccess } from "@/lib/sound";
import type { RepairVoucherData } from "@/components/RepairVoucher";

/** A repair voucher scanned at the till: the phone goes back to its owner in one step —
 *  the job is marked Delivered, the balance lands in the chosen wallet, and the receipt
 *  (stamped "collected") can be printed. A job already collected just reprints it. */

export interface HandBackJob {
  id: string; jobNo: string; status: string; deviceBrand: string; deviceModel: string;
  customerName?: string | null; customerPhone?: string | null; imei?: string | null; accessories?: string | null;
  problem: string; estimatedCost: string; finalCost: string; paidAmount: string;
  receivedAt: string; deliveredAt?: string | null; trackToken?: string | null;
}
interface Wallet { id: string; name: string; currency: string }

const kyat = (minor: string) => Number(minor) / 100;

export function RepairHandBack({ job, wallets, onClose }: { job: HandBackJob | null; wallets: Wallet[]; onClose: () => void }) {
  const { me, hasPerm } = useAuth();
  const { push } = useToast();
  const [current, setCurrent] = useState<HandBackJob | null>(job);
  const [charge, setCharge] = useState("");
  const [walletId, setWalletId] = useState("");
  const [busy, setBusy] = useState(false);
  const mmk = wallets.filter((w) => w.currency === "MMK");

  useEffect(() => {
    // A fresh scan starts from that job's own figures.
    const t = window.setTimeout(() => {
      setCurrent(job);
      if (job) setCharge(String(kyat(Number(job.finalCost) ? job.finalCost : job.estimatedCost) || ""));
      setWalletId((w) => w || mmk[0]?.id || "");
    }, 0);
    return () => window.clearTimeout(t);
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on a new scan only

  if (!current) return null;
  const delivered = current.status === "DELIVERED";
  const cancelled = current.status === "CANCELLED";
  const canHandBack = hasPerm("repair.update") && hasPerm("wallet.view");
  const chargeKyat = Number(charge) || 0;
  const paid = kyat(current.paidAmount);
  const balance = Math.max(0, chargeKyat - paid);
  const needsCharge = chargeKyat <= 0 && current.status !== "CANNOT_REPAIR";

  function voucherData(j: HandBackJob): RepairVoucherData {
    return {
      jobNo: j.jobNo,
      at: j.receivedAt,
      shopName: me?.business?.name ?? "Mahar Mini POS",
      shopLogo: me?.business?.logoUrl ?? undefined,
      shopPhone: me?.business?.phone ?? undefined,
      shopAddress: me?.business?.address ?? undefined,
      customerName: j.customerName ?? undefined,
      customerPhone: j.customerPhone ?? undefined,
      deviceBrand: j.deviceBrand,
      deviceModel: j.deviceModel,
      imei: j.imei ?? undefined,
      accessories: j.accessories ?? undefined,
      problem: j.problem,
      status: j.status,
      deliveredAt: j.deliveredAt ?? undefined,
      estimatedCost: kyat(j.estimatedCost),
      finalCost: kyat(j.finalCost),
      paidAmount: kyat(j.paidAmount),
      trackUrl: j.trackToken ? `${window.location.origin}/track/${j.trackToken}` : undefined,
    };
  }

  async function handBack() {
    if (!current) return;
    setBusy(true);
    try {
      const updated = await api<HandBackJob>(`/api/v1/repairs/${current.id}`, {
        method: "PATCH",
        body: {
          status: "DELIVERED",
          finalCost: chargeKyat > 0 ? String(chargeKyat) : undefined,
          walletId: balance > 0 ? walletId : undefined,
        },
      });
      playSuccess();
      push(`${current.jobNo} handed back`);
      setCurrent({ ...current, ...updated, trackToken: current.trackToken });
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    if (!current) return;
    void printRepairVoucher(voucherData(current)).then((ok) => {
      if (!ok) push("The browser blocked the print window. Allow pop-ups for this site and try again.", "error");
    });
  }

  return (
    <Modal open onClose={onClose} title={`${current.jobNo} — ${current.deviceBrand} ${current.deviceModel}`}>
      <div className="space-y-3">
        <div className="space-y-1 text-sm">
          {(current.customerName || current.customerPhone) && (
            <p>{[current.customerName, current.customerPhone].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-gray-600 dark:text-gray-300">{current.problem}</p>
          <p>Status: <b>{REPAIR_STATUS_LABELS[current.status as RepairStatus] ?? current.status}</b> <span className="text-gray-500">({REPAIR_STATUS_MM[current.status] ?? current.status})</span></p>
        </div>

        {delivered ? (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-green-800 dark:bg-green-950/40 dark:text-green-300">
              <CheckCircle2 size={20} />
              <div className="text-sm">
                <b>Collected · ဖုန်းရွေးယူပြီး</b>
                {current.deliveredAt && <div>{fmtDateTime(current.deliveredAt)}</div>}
                <div>Paid {fmtMoney(current.paidAmount)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={printReceipt}><Printer size={16} className="mr-1 inline" />Print receipt</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : cancelled ? (
          <>
            <p className="rounded-lg bg-gray-100 p-3 text-sm dark:bg-gray-800">This repair was cancelled. Hand it back from the Repairs page if needed.</p>
            <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
          </>
        ) : !canHandBack ? (
          <>
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Handing a phone back takes money, which your account cannot do.</p>
            <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
          </>
        ) : (
          <>
            <Input label="Charge (MMK)" inputMode="numeric" value={charge} onChange={(e) => setCharge(e.target.value.replace(/[^\d]/g, ""))} />
            <div className="space-y-0.5 text-sm">
              {paid > 0 && <div className="flex justify-between"><span>Already paid</span><span className="tabular-nums">{fmtMoney(current.paidAmount)}</span></div>}
              <div className="flex justify-between text-base font-bold"><span>To collect now</span><span className="tabular-nums">{balance.toLocaleString("en-US")} MMK</span></div>
            </div>
            {balance > 0 && (
              <Select label="Receive into wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                {mmk.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handBack} disabled={busy || needsCharge || (balance > 0 && !walletId)}>
                {busy ? "Saving…" : "Hand back"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

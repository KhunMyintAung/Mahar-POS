"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Check, Copy, Upload, Clock, X } from "lucide-react";
import { Button, Card, CardTitle, Modal, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { api } from "@/lib/client";
import { resizeImage } from "@/lib/imageResize";
import { fmtDateTime } from "@/lib/format";
import { PRO_MONTH_OPTIONS } from "@/lib/plan";

/** What Pro adds over Free. */
const PRO_FEATURES = [
  "Reports (profit and the detailed ones)",
  "More than one branch, with stock transfer",
  "Online shop and the Telegram customer bot / AI",
  "Top-up billers",
  "Full money tools — transfer, cash-out, credit",
  "Staff management, audit log",
  "Offline mode and pop-up notifications",
];

interface Payment {
  id: string; months: number; amountMinor: number; method: string;
  status: "PENDING" | "APPROVED" | "REJECTED"; note: string | null;
  reviewedAt: string | null; createdAt: string;
}

const STATUS = {
  PENDING: { label: "Under review", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  APPROVED: { label: "Approved", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  REJECTED: { label: "Not confirmed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
} as const;

/** Settings → Upgrade. Shows the shop's plan and what Pro gives, then an in-app flow to pay:
 *  pick a length, see the operator's KBZ Pay account, upload the payment slip, and submit. The
 *  operator reviews it in the admin portal; approval is what turns Pro on. */
export function ProUpgradeCard() {
  const { me, refreshAuth } = useAuth();
  const plan = me?.plan;
  const { push } = useToast();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [open, setOpen] = useState(false);

  const loadPayments = useCallback(() => {
    api<{ payments: Payment[] }>("/api/v1/pro/payments").then((d) => setPayments(d.payments)).catch(() => setPayments([]));
  }, []);
  useEffect(loadPayments, [loadPayments]);

  if (!plan) return null;
  const isPro = plan.plan === "PRO";
  const price = plan.priceMMK.toLocaleString("en-US");
  const pending = payments?.find((p) => p.status === "PENDING") ?? null;
  const hasAccount = Boolean(plan.pay.name || plan.pay.phone);

  return (
    <div id="upgrade">
    <Card className="space-y-3 border-blue-200 dark:border-blue-900">
      <CardTitle icon={Sparkles} title="Mahar POS Pro" />

      <div className={cn("rounded-lg px-3 py-2 text-sm", isPro
        ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
        : "bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-200")}>
        {isPro
          ? <>You are on <b>Pro</b> — {plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"} left.</>
          : <>You are on <b>Free</b>. Upgrade to Pro to switch the features below back on.</>}
      </div>

      <div>
        <div className="text-2xl font-bold">{price} <span className="text-base font-medium text-gray-500">Ks / month</span></div>
        <ul className="mt-2 space-y-1 text-sm">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check size={15} className="mt-0.5 shrink-0 text-green-600" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {pending ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Clock size={16} className="shrink-0" />
          <span>Your payment for {pending.months} month{pending.months === 1 ? "" : "s"} is being checked. Pro turns on once it is confirmed.</span>
        </div>
      ) : hasAccount ? (
        <Button onClick={() => setOpen(true)}>
          <Sparkles size={16} className="mr-1 inline" />{isPro ? "Renew / extend Pro" : "Upgrade to Pro"}
        </Button>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          Contact the shop that gave you Mahar POS to pay for Pro.
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="space-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase text-gray-500">Your payments</div>
          {payments.slice(0, 5).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-300">{fmtDateTime(p.createdAt)} · {p.months} mo · {(p.amountMinor / 100).toLocaleString("en-US")} Ks</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>

    <PayModal open={open} onClose={() => setOpen(false)} priceMMK={plan.priceMMK} pay={plan.pay}
      onDone={() => { setOpen(false); loadPayments(); refreshAuth(); push("Payment submitted — it is being checked."); }} />
    </div>
  );
}

/** The pay flow: pick a length, see the account, upload the slip, submit. */
function PayModal({ open, onClose, priceMMK, pay, onDone }: {
  open: boolean; onClose: () => void; priceMMK: number;
  pay: { name: string; phone: string; method: string; note: string }; onDone: () => void;
}) {
  const { push } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [months, setMonths] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Fresh each time the modal opens.
  useEffect(() => { if (open) { setStep(1); setMonths(1); setSlip(null); setBusy(false); } }, [open]);

  const total = priceMMK * months;
  const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text).then(() => push(`${what} copied`)).catch(() => {}); };

  async function pickSlip(file: File | undefined) {
    if (!file) return;
    try {
      setSlip(await resizeImage(file));
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not read that image", "error");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit() {
    if (!slip) { push("Upload the payment screenshot first", "error"); return; }
    setBusy(true);
    try {
      await api("/api/v1/pro/payments", { method: "POST", body: { months, slipUrl: slip } });
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={step === 1 ? "Upgrade to Pro" : "Complete payment"}
      footer={step === 1
        ? <Button onClick={() => setStep(2)}>Continue</Button>
        : <>
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={submit} disabled={busy || !slip}>{busy ? "Submitting…" : "Submit order"}</Button>
          </>}>
      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Choose how long you want Pro for. It is added on top of any days you have left.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRO_MONTH_OPTIONS.map((m) => (
              <button key={m} type="button" onClick={() => setMonths(m)}
                className={cn("rounded-xl border p-3 text-center transition",
                  months === m ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/40" : "border-gray-200 hover:border-gray-300 dark:border-gray-700")}>
                <div className="text-lg font-bold">{m}</div>
                <div className="text-xs text-gray-500">month{m === 1 ? "" : "s"}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
            <span className="text-sm text-gray-600 dark:text-gray-300">Total to pay</span>
            <span className="text-xl font-bold">{total.toLocaleString("en-US")} Ks</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold dark:border-gray-800">Send exactly this amount</div>
            <Row label="Method" value={pay.method} />
            {pay.name && <Row label="Account" value={pay.name} onCopy={() => copy(pay.name, "Name")} />}
            {pay.phone && <Row label="Phone" value={pay.phone} onCopy={() => copy(pay.phone, "Number")} />}
            <Row label="Amount" value={`${total.toLocaleString("en-US")} Ks`} strong onCopy={() => copy(String(total), "Amount")} />
          </div>
          {pay.note && <p className="whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">{pay.note}</p>}

          <div>
            <div className="mb-1 text-sm font-medium">Upload payment screenshot</div>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickSlip(e.target.files?.[0])} />
            {slip ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
                <img src={slip} alt="Payment slip" className="max-h-56 rounded-lg border border-gray-200 dark:border-gray-700" />
                <button type="button" onClick={() => setSlip(null)} aria-label="Remove image"
                  className="absolute -right-2 -top-2 rounded-full bg-gray-900 p-1 text-white shadow">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-blue-400 dark:border-gray-700">
                <Upload size={20} />
                <span>Click to upload</span>
                <span className="text-xs">PNG or JPG</span>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">After you submit, the operator checks the slip and turns on your Pro. Usually within a day.</p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, strong, onCopy }: { label: string; value: string; strong?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className={cn(strong ? "text-lg font-bold text-blue-700 dark:text-blue-300" : "font-medium")}>{value}</span>
        {onCopy && <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><Copy size={14} /></button>}
      </span>
    </div>
  );
}

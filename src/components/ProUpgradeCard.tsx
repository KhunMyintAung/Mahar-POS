"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Sparkles, Check, Copy, Upload, Clock, X } from "lucide-react";
import { Button, Card, CardTitle, Modal, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { api } from "@/lib/client";
import { resizeImage } from "@/lib/imageResize";
import { fmtDateTime } from "@/lib/format";
import { PRO_MONTH_OPTIONS, proTotalMMK, thbForMMK, type ProTier } from "@/lib/plan";
import { promptPayWithAmount } from "@/lib/promptpay";

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

/** What Fully Access adds on top of Pro. */
const FULL_EXTRAS = ["Unlimited data and photo input", "Quick support"];

const LEVEL = { PRO: "Pro", FULL: "Fully Access" } as const;

interface Payment {
  id: string; months: number; tier: ProTier; amountMinor: number; amountThb: number | null; method: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "VOIDED"; note: string | null;
  reviewedAt: string | null; createdAt: string;
}

const STATUS = {
  PENDING: { label: "Under review", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  APPROVED: { label: "Approved", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  REJECTED: { label: "Not confirmed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  VOIDED: { label: "Reversed", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
} as const;

type PlanInfo = NonNullable<ReturnType<typeof useAuth>["me"]>["plan"];

/** Settings → Upgrade. Shows the shop's plan and what each level gives, then an in-app flow to pay:
 *  pick a level and length, see the operator's KBZ Pay or PromptPay account (with a QR to scan),
 *  upload the payment slip, and submit. The operator reviews it in the admin portal; approval is
 *  what turns Pro on. */
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
  const pending = payments?.find((p) => p.status === "PENDING") ?? null;
  const hasAccount = Boolean(plan.pay.name || plan.pay.phone);
  const proPrice = plan.tierPriceMMK.PRO.toLocaleString("en-US");
  const fullPrice = plan.tierPriceMMK.FULL.toLocaleString("en-US");

  return (
    <div id="upgrade">
    <Card className="space-y-3 border-blue-200 dark:border-blue-900">
      <CardTitle icon={Sparkles} title="Mahar POS Pro" />

      <div className={cn("rounded-lg px-3 py-2 text-sm", isPro
        ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
        : "bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-200")}>
        {isPro
          ? `You are on ${LEVEL[plan.tier]} — ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left.`
          : "You are on Free. Upgrade to Pro to switch the features below back on."}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
          <div className="font-semibold">Pro</div>
          <div className="text-2xl font-bold">{proPrice}{" "}<span className="text-sm font-medium text-gray-500">Ks / month</span></div>
          <ul className="mt-2 space-y-1 text-sm">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-green-600" /><span>{f}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border-2 border-blue-500 p-3">
          <div className="font-semibold">Fully Access</div>
          <div className="text-2xl font-bold">{fullPrice}{" "}<span className="text-sm font-medium text-gray-500">Ks / month</span></div>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-green-600" /><span>Everything in Pro</span></li>
            {FULL_EXTRAS.map((f) => (
              <li key={f} className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-green-600" /><span>{f}</span></li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-gray-500">{`Save ${Number(plan.termSavingMMK["6"]).toLocaleString("en-US")} Ks when you buy 6 months, or ${Number(plan.termSavingMMK["12"]).toLocaleString("en-US")} Ks for a year.`}</p>

      {pending ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Clock size={16} className="shrink-0" />
          <span>{`Your payment for ${LEVEL[pending.tier]}, ${pending.months} month${pending.months === 1 ? "" : "s"} is being checked. It turns on once it is confirmed.`}</span>
        </div>
      ) : hasAccount ? (
        <Button onClick={() => setOpen(true)}>
          <Sparkles size={16} className="mr-1 inline" />{isPro ? "Renew / change plan" : "Upgrade to Pro"}
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
              <span className="text-gray-600 dark:text-gray-300">{fmtDateTime(p.createdAt)} · {LEVEL[p.tier]} · {p.months} mo · {(p.amountMinor / 100).toLocaleString("en-US")} Ks</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>

    <PayModal open={open} onClose={() => setOpen(false)} plan={plan}
      onDone={() => { setOpen(false); loadPayments(); refreshAuth(); push("Payment submitted — it is being checked."); }} />
    </div>
  );
}

/** A QR for the text, as an image the payer can scan with their banking app. */
function Qr({ payload, label }: { payload: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 420, color: { dark: "#111827", light: "#ffffff" } })
      .then((url) => { if (live) setSrc(url); })
      .catch(() => { if (live) setSrc(""); });
    return () => { live = false; };
  }, [payload]);
  if (!src) return <div className="grid h-44 w-44 place-items-center rounded-lg bg-gray-50 text-xs text-gray-400 dark:bg-gray-800">Making QR…</div>;
  // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
  return <img src={src} alt={label} className="h-44 w-44 rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700" />;
}

/** The pay flow: pick a level and length, see the account and QR, upload the slip, submit. */
function PayModal({ open, onClose, plan, onDone }: {
  open: boolean; onClose: () => void; plan: NonNullable<PlanInfo>; onDone: () => void;
}) {
  const { push } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [tier, setTier] = useState<ProTier>("PRO");
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState<"KBZPAY" | "PROMPAY">("KBZPAY");
  const [slip, setSlip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pay = plan.pay;
  const promptPayOn = pay.mmkPerThb != null;

  // Fresh each time the modal opens (keeping the level the shop is already on as the first choice).
  useEffect(() => {
    if (open) { setStep(1); setTier(plan.tier); setMonths(1); setMethod("KBZPAY"); setSlip(null); setBusy(false); }
  }, [open, plan.tier]);

  const total = proTotalMMK(tier, months);
  const thb = thbForMMK(total, pay.mmkPerThb);
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
      await api("/api/v1/pro/payments", { method: "POST", body: { tier, months, method, slipUrl: slip } });
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // The QR the payer scans: KBZ Pay's code, or PromptPay's with the baht amount fixed in it.
  const qrPayload = method === "PROMPAY"
    ? (thb ? promptPayWithAmount(pay.promptPay.payload, thb) : pay.promptPay.payload)
    : pay.kbzPayload;

  return (
    <Modal open={open} onClose={onClose} title={step === 1 ? "Upgrade your plan" : "Complete payment"}
      footer={step === 1
        ? <Button onClick={() => setStep(2)}>Continue</Button>
        : <>
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={submit} disabled={busy || !slip}>{busy ? "Submitting…" : "Submit order"}</Button>
          </>}>
      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["PRO", "FULL"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTier(t)}
                className={cn("rounded-xl border p-3 text-left transition",
                  tier === t ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/40" : "border-gray-200 hover:border-gray-300 dark:border-gray-700")}>
                <div className="font-semibold">{LEVEL[t]}</div>
                <div className="text-lg font-bold">{plan.tierPriceMMK[t].toLocaleString("en-US")} <span className="text-xs font-medium text-gray-500">Ks / month</span></div>
                <div className="mt-1 text-xs text-gray-500">{t === "PRO" ? "Every Pro feature" : "Pro + unlimited data and photo input + quick support"}</div>
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">How long? It is added on top of any days you have left.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRO_MONTH_OPTIONS.map((m) => {
                const saving = plan.termSavingMMK[String(m)];
                return (
                  <button key={m} type="button" onClick={() => setMonths(m)}
                    className={cn("rounded-xl border p-3 text-center transition",
                      months === m ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/40" : "border-gray-200 hover:border-gray-300 dark:border-gray-700")}>
                    <div className="text-lg font-bold">{m}</div>
                    <div className="text-xs text-gray-500">{m === 1 ? "month" : "months"}</div>
                    {saving ? <div className="mt-1 text-[11px] font-semibold text-green-600">{`Save ${Number(saving).toLocaleString("en-US")}`}</div> : <div className="mt-1 text-[11px]">&nbsp;</div>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
            <span className="text-sm text-gray-600 dark:text-gray-300">Total to pay</span>
            <span className="text-xl font-bold">{total.toLocaleString("en-US")} Ks</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setMethod("KBZPAY")}
              className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium", method === "KBZPAY" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "border-gray-200 dark:border-gray-700")}>
              KBZ Pay <span className="block text-[11px] font-normal text-gray-500">Myanmar</span>
            </button>
            {promptPayOn && (
              <button type="button" onClick={() => setMethod("PROMPAY")}
                className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium", method === "PROMPAY" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "border-gray-200 dark:border-gray-700")}>
                PromptPay <span className="block text-[11px] font-normal text-gray-500">Thailand</span>
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <Qr payload={qrPayload} label={method === "PROMPAY" ? "PromptPay QR" : "KBZ Pay QR"} />
            <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold dark:border-gray-800">Send exactly this amount</div>
              {method === "PROMPAY" ? (
                <>
                  <Row label="Method" value="PromptPay" />
                  <Row label="Account" value={pay.promptPay.name} />
                  <Row label="Amount" value={`${(thb ?? 0).toLocaleString("en-US")} THB`} strong onCopy={() => copy(String(thb ?? ""), "Amount")} />
                  <Row label="Equals" value={`${total.toLocaleString("en-US")} Ks`} />
                </>
              ) : (
                <>
                  <Row label="Method" value={pay.method} />
                  {pay.name && <Row label="Account" value={pay.name} onCopy={() => copy(pay.name, "Name")} />}
                  {pay.phone && <Row label="Phone" value={pay.phone} onCopy={() => copy(pay.phone, "Number")} />}
                  <Row label="Amount" value={`${total.toLocaleString("en-US")} Ks`} strong onCopy={() => copy(String(total), "Amount")} />
                </>
              )}
            </div>
          </div>
          {method === "PROMPAY" && <p className="text-xs text-gray-500">Scan with your Thai banking app — the amount is already filled in.</p>}
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
          <p className="text-xs text-gray-500">After you submit, the operator checks the slip and turns on your plan. Usually within a day.</p>
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

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BatteryMedium, CheckCircle2, ClipboardCheck, History, Search, Smartphone, UserRound, Wallet as WalletIcon, Wrench, X, type LucideIcon } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, CardTitle, Input, Select, Modal, Spinner, StatCard, cn, useToast } from "@/components/ui";
import { normalizeImei } from "@/lib/imeiInput";
import { BODY_CONDITIONS, QC_GRADES, QC_GRADE_TEXT, type QcGrade } from "@/lib/tradeInQc";
import { matchesWords } from "@/lib/searchWords";
import { useCurrency } from "@/components/AppShell";

/** Second-hand phones bought from customers: buy (into QC), check, then route each one to the
 *  shelf or to the shop's own repair bench. Repair costs go onto the phone's own cost. */

export interface TradeInItem { id: string; name: string; sku: string; costPrice: string; sellingPrice?: string; trackSerial?: boolean; model?: string | null }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Phone {
  id: string; imei: string; status: "QC" | "IN_REPAIR" | "IN_STOCK" | "SOLD" | "REMOVED"; itemName: string; model?: string | null;
  sellingPrice: string; cost: string | null; repairCost: string; batteryHealth: number | null; qcNote: string | null; qcAt: string | null;
  qcGrade: string | null; bodyCondition: string | null;
  receivedAt: string; purchaseNo?: string; sellerName: string | null; sellerPhone: string | null;
  repair: { id: string; jobNo: string; status: string; problem: string; partsCost: string; laborCost: string; technicianName: string | null } | null;
}

const num = (v: string) => parseFloat(v.replace(/,/g, "")) || 0;
const toMinor = (v: string) => BigInt(Math.round(num(v) * 100));
const PICK_LOOK = "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300";

/** The Trade-in tab: phones waiting for QC and phones in repair, each with its next step. */
export function TradeInList({ wallets, reloadKey, canAct }: { wallets: Wallet[]; reloadKey: number; canAct: boolean }) {
  const [phones, setPhones] = useState<Phone[] | null>(null);
  const [done, setDone] = useState<Phone[]>([]);
  const [qcFor, setQcFor] = useState<Phone | null>(null);
  const [repairedFor, setRepairedFor] = useState<Phone | null>(null);
  const { push } = useToast();

  const load = useCallback(() => {
    api<{ phones: Phone[] }>("/api/v1/trade-ins").then((d) => setPhones(d.phones)).catch((e) => push(e.message, "error"));
    api<{ phones: Phone[] }>("/api/v1/trade-ins?done=1").then((d) => setDone(d.phones)).catch(() => {});
  }, [push]);
  useEffect(load, [load, reloadKey]);

  if (!phones) return <Spinner />;
  const qc = phones.filter((p) => p.status === "QC");
  const inRepair = phones.filter((p) => p.status === "IN_REPAIR");
  // What the phones not yet on the shelf have cost so far.
  const held = phones.reduce((sum, p) => sum + BigInt(p.cost ?? "0") + BigInt(p.repair?.partsCost ?? "0"), 0n);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatCard label="Waiting for QC" value={qc.length} tone="amber" />
        <StatCard label="In repair" value={inRepair.length} tone="blue" />
        <div className="col-span-2 sm:col-span-1"><StatCard label="Money in these phones" value={fmtMoney(held.toString())} /></div>
      </div>

      <Section icon={ClipboardCheck} title="Waiting for QC" count={qc.length} empty="No phones waiting for QC">
        {qc.map((p) => (
          <PhoneRow key={p.id} p={p}>
            {canAct && <Button size="sm" onClick={() => setQcFor(p)}><ClipboardCheck size={14} className="mr-1 inline" />QC</Button>}
          </PhoneRow>
        ))}
      </Section>
      <Section icon={Wrench} title="In repair" count={inRepair.length} empty="No phones in repair">
        {inRepair.map((p) => (
          <PhoneRow key={p.id} p={p}>
            {canAct && <Button size="sm" onClick={() => setRepairedFor(p)}><CheckCircle2 size={14} className="mr-1 inline" />Repair done</Button>}
          </PhoneRow>
        ))}
      </Section>
      {done.length > 0 && (
        <Section icon={History} title="Checked in the last 30 days" count={done.length} empty="">
          {done.map((p) => <PhoneRow key={p.id} p={p} />)}
        </Section>
      )}

      <QcModal phone={qcFor} onClose={() => setQcFor(null)} onDone={() => { setQcFor(null); load(); }} />
      <RepairedModal phone={repairedFor} wallets={wallets} onClose={() => setRepairedFor(null)} onDone={() => { setRepairedFor(null); load(); }} />
    </div>
  );
}

function Section({ icon, title, count, empty, children }: { icon: LucideIcon; title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <Card>
      <CardTitle icon={icon} title={title}>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">{count}</span>
      </CardTitle>
      {count === 0
        ? <p className="pt-3 text-center text-sm text-gray-500 dark:text-gray-400">{empty}</p>
        : <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">{children}</div>}
    </Card>
  );
}

const STATUS_LOOK: Record<string, string> = {
  QC: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  IN_REPAIR: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  IN_STOCK: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  SOLD: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};
const STATUS_TEXT: Record<string, string> = { QC: "Waiting for QC", IN_REPAIR: "In repair", IN_STOCK: "Ready to sell", SOLD: "Sold", REMOVED: "Removed" };
const GRADE_LOOK: Record<string, string> = {
  A: "bg-green-600 text-white", B: "bg-blue-600 text-white", C: "bg-amber-500 text-white", D: "bg-red-600 text-white",
};

/** One small fact about a phone. */
function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{children}</span>;
}

function PhoneRow({ p, children }: { p: Phone; children?: ReactNode }) {
  const repaired = BigInt(p.repairCost);
  const bought = BigInt(p.cost ?? "0") - repaired;
  const parts = p.status === "IN_REPAIR" ? BigInt(p.repair?.partsCost ?? "0") : 0n;
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{p.itemName}</span>
          {p.qcGrade && <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", GRADE_LOOK[p.qcGrade] ?? "bg-gray-100 text-gray-700")} title={QC_GRADE_TEXT[p.qcGrade as QcGrade]}>{`Grade ${p.qcGrade}`}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_LOOK[p.status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>{STATUS_TEXT[p.status] ?? p.status}</span>
        </div>
        <div className="font-mono text-xs text-gray-600 dark:text-gray-400">{p.imei}</div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
          {p.sellerName && <span>{p.sellerName}{p.sellerPhone ? ` · ${p.sellerPhone}` : ""}</span>}
          {p.purchaseNo && <span>{p.purchaseNo}</span>}
          {p.repair && <span>{p.repair.jobNo}</span>}
          <span>{fmtDateTime(p.receivedAt)}</span>
        </div>
        {(p.batteryHealth != null || p.bodyCondition) && (
          <div className="flex flex-wrap gap-1.5">
            {p.batteryHealth != null && <Chip><BatteryMedium size={13} /><span>{`Battery ${p.batteryHealth}%`}</span></Chip>}
            {p.bodyCondition && <Chip>{p.bodyCondition}</Chip>}
          </div>
        )}
        {p.repair?.problem && <p className="flex items-start gap-1 text-xs text-gray-600 dark:text-gray-400"><Wrench size={12} className="mt-0.5 shrink-0" /><span>{p.repair.problem}</span></p>}
        {p.qcNote && <p className="text-xs text-gray-600 dark:text-gray-400">{p.qcNote}</p>}
      </div>
      <dl className="grid shrink-0 grid-cols-[auto_auto] justify-between gap-x-3 text-xs tabular-nums sm:w-40">
        <CostLine label="Bought" value={bought} />
        {parts > 0n && <CostLine label="Parts" value={parts} />}
        {repaired > 0n && <CostLine label="Repair" value={repaired} />}
        {repaired > 0n && <CostLine label="Cost" value={BigInt(p.cost ?? "0")} bold />}
      </dl>
      {children && <div className="flex shrink-0 justify-end sm:w-32">{children}</div>}
    </div>
  );
}

function CostLine({ label, value, bold }: { label: string; value: bigint; bold?: boolean }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={cn("text-right", bold && "font-semibold")}>{fmtMoney(value.toString())}</dd>
    </>
  );
}

/** A titled part of a form. */
function FormPart({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {Icon && <Icon size={14} />}<span>{title}</span>
      </h4>
      {children}
    </section>
  );
}

/** Which phone a form is about. */
function PhoneHead({ phone }: { phone: Phone }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
      <Smartphone size={20} className="shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{phone.itemName}</div>
        <div className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">{phone.imei}{phone.repair ? ` · ${phone.repair.jobNo}` : ""}</div>
      </div>
    </div>
  );
}

/** Save and Close, with what is still missing beside them. */
function FormFooter({ problem, busy, onClose, onSave, saveLabel }: { problem: string; busy: boolean; onClose: () => void; onSave: () => void; saveLabel: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {problem && <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">{problem}</span>}
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Button disabled={busy || !!problem} onClick={onSave}>{busy ? "Saving…" : saveLabel}</Button>
    </div>
  );
}

/** Grade A to D and how the body looks: given at QC, and again once a repair is done. */
function GradePicker({ grade, onGrade, body, onBody }: { grade: string; onGrade: (g: QcGrade) => void; body: string; onBody: (b: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">QC grade</span>
        <div className="grid grid-cols-4 gap-1.5">
          {QC_GRADES.map((g) => (
            <button key={g} type="button" onClick={() => onGrade(g)} title={QC_GRADE_TEXT[g]}
              className={cn("rounded-lg border py-2 text-base font-bold transition", grade === g ? cn(GRADE_LOOK[g], "border-transparent") : PICK_LOOK)}>
              {g}
            </button>
          ))}
        </div>
        {grade && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{QC_GRADE_TEXT[grade as QcGrade]}</p>}
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Body condition</span>
        <div className="grid grid-cols-2 gap-1.5">
          {BODY_CONDITIONS.map((b) => (
            <button key={b} type="button" onClick={() => onBody(b)}
              className={cn("rounded-lg border px-2 py-2 text-sm transition", body === b ? "border-blue-600 bg-blue-50 font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : PICK_LOOK)}>
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QcModal({ phone, onClose, onDone }: { phone: Phone | null; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<"READY" | "REPAIR" | "">("");
  const [battery, setBattery] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [technician, setTechnician] = useState("");
  const [grade, setGrade] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (phone && shownFor !== phone.id) {
    setShownFor(phone.id); setResult(""); setBattery(""); setNote(""); setProblem(""); setTechnician(""); setGrade(""); setBody("");
  }

  const batteryNum = battery.trim() === "" ? null : Math.round(num(battery));
  const missing =
    !grade ? "Choose the QC grade"
    : !body ? "Choose the body condition"
    : !result ? "Choose the QC result"
    : batteryNum != null && (batteryNum < 0 || batteryNum > 100) ? "Battery health is 0 to 100"
    : result === "REPAIR" && !problem.trim() ? "Say what needs repairing"
    : "";

  async function save() {
    if (!phone) return;
    setBusy(true);
    try {
      const r = await api<{ status: string; jobNo?: string }>(`/api/v1/trade-ins/${phone.id}/qc`, {
        method: "POST",
        body: { result, grade, bodyCondition: body, batteryHealth: batteryNum, note: note.trim() || undefined, problem: problem.trim() || undefined, technicianName: technician.trim() || undefined },
      });
      push(r.status === "IN_STOCK" ? "Ready to sell — in stock" : `Sent to repair (${r.jobNo})`);
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!phone} onClose={onClose} title="QC check" footer={<FormFooter problem={missing} busy={busy} onClose={onClose} onSave={save} saveLabel="Save QC" />}>
      {phone && (
        <div className="space-y-4">
          <PhoneHead phone={phone} />
          <FormPart title="Condition">
            <GradePicker grade={grade} onGrade={setGrade} body={body} onBody={setBody} />
            <Input label="Battery health %" inputMode="numeric" value={battery} onChange={(e) => setBattery(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} placeholder="e.g. 86" />
            <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Small scratch on the back" />
          </FormPart>
          <FormPart title="QC result">
            <div className="grid grid-cols-2 gap-2">
              {([["READY", "Ready to sell", CheckCircle2], ["REPAIR", "Needs repair", Wrench]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" onClick={() => setResult(k)}
                  className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition",
                    result === k
                      ? k === "READY" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "border-purple-600 bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                      : PICK_LOOK)}>
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
            {result === "REPAIR" && (
              <>
                <Input label="What needs repairing" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. Screen cracked, battery weak" />
                <Input label="Technician (optional)" value={technician} onChange={(e) => setTechnician(e.target.value)} />
                <p className="text-xs text-gray-500 dark:text-gray-400">A repair job opens in Repairs. Parts used for it (Repair use in Stock) and the repair fee are added to this phone&apos;s cost.</p>
              </>
            )}
          </FormPart>
        </div>
      )}
    </Modal>
  );
}

function RepairedModal({ phone, wallets, onClose, onDone }: { phone: Phone | null; wallets: Wallet[]; onClose: () => void; onDone: () => void }) {
  const cur = useCurrency();
  const [fee, setFee] = useState("");
  const [paidNow, setPaidNow] = useState(true);
  const [walletId, setWalletId] = useState("");
  const [note, setNote] = useState("");
  const [grade, setGrade] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (phone && shownFor !== phone.id) {
    // What QC found, to change if the repair made it better.
    setShownFor(phone.id); setFee(""); setPaidNow(true); setWalletId(""); setNote("");
    setGrade(phone.qcGrade ?? ""); setBody(phone.bodyCondition ?? "");
  }
  const mmk = wallets.filter((w) => w.currency === cur);
  const wallet = walletId || mmk[0]?.id || "";
  const parts = BigInt(phone?.repair?.partsCost ?? "0");
  const feeMinor = toMinor(fee);
  const bought = BigInt(phone?.cost ?? "0");
  const missing = feeMinor > 0n && paidNow && !wallet ? "Choose the wallet the fee was paid from" : "";

  async function save() {
    if (!phone) return;
    setBusy(true);
    try {
      await api(`/api/v1/trade-ins/${phone.id}/repaired`, {
        method: "POST",
        body: { laborCost: String(num(fee)), walletId: feeMinor > 0n && paidNow ? wallet : undefined, note: note.trim() || undefined, grade: grade || undefined, bodyCondition: body || undefined },
      });
      push("Repaired — in stock");
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!phone} onClose={onClose} title="Repair done" footer={<FormFooter problem={missing} busy={busy} onClose={onClose} onSave={save} saveLabel="Put in stock" />}>
      {phone && (
        <div className="space-y-4">
          <PhoneHead phone={phone} />
          <FormPart icon={WalletIcon} title="Repair fee">
            <Input aria-label="Repair fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            {feeMinor > 0n && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} />
                  <span>Paid out now (expense)</span>
                </label>
                {paidNow && (
                  <Select label="Paid from" value={wallet} onChange={(e) => setWalletId(e.target.value)}>
                    {mmk.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                )}
              </>
            )}
          </FormPart>
          <FormPart title="Condition">
            <GradePicker grade={grade} onGrade={setGrade} body={body} onBody={setBody} />
            <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormPart>
          <div className="space-y-1 rounded-lg border border-gray-200 p-3 text-sm tabular-nums dark:border-gray-700">
            <TotalLine label="Bought" value={bought} />
            <TotalLine label="Parts used" value={parts} />
            <TotalLine label="Repair fee" value={feeMinor} />
            <div className="border-t border-gray-200 pt-1 dark:border-gray-700"><TotalLine label="Phone cost" value={bought + parts + feeMinor} bold /></div>
            <p className="pt-1 text-xs text-gray-500 dark:text-gray-400">Parts are the ones taken from stock for this job (Stock → Repair use).</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TotalLine({ label, value, bold }: { label: string; value: bigint; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "font-semibold")}>
      <span className={bold ? "" : "text-gray-500 dark:text-gray-400"}>{label}</span><span>{fmtMoney(value.toString())}</span>
    </div>
  );
}

/** Buying a second-hand phone from a customer. */
export function NewTradeInModal({ open, onClose, onSaved, items, wallets, branchId, onItemAdded }: {
  open: boolean; onClose: () => void; onSaved: (saved: { id: string; txnNo: string; paid: string }) => void;
  items: TradeInItem[]; wallets: Wallet[]; branchId: string; onItemAdded: (it: TradeInItem) => void;
}) {
  const cur = useCurrency();
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSell, setNewSell] = useState("");
  const [imei, setImei] = useState("");
  const [price, setPrice] = useState("");
  const [walletId, setWalletId] = useState("");
  const [onCredit, setOnCredit] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setSellerName(""); setSellerPhone(""); setQuery(""); setItemId(""); setNewName(""); setNewSell(""); setImei(""); setPrice(""); setWalletId(""); setOnCredit(false); }
  }

  const phones = useMemo(() => items.filter((it) => it.trackSerial), [items]);
  const picked = phones.find((it) => it.id === itemId);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return phones.filter((it) => matchesWords(q, it.name, it.sku, it.model)).slice(0, 8);
  }, [phones, query]);
  const mmk = wallets.filter((w) => w.currency === cur);
  const wallet = walletId || mmk[0]?.id || "";
  const imeiClean = normalizeImei(imei);

  const missing =
    !sellerName.trim() ? "Enter the seller's name"
    : !picked && !newName.trim() ? "Choose the phone model"
    : !/^[A-Z0-9]{5,32}$/.test(imeiClean) ? "Enter the IMEI"
    : num(price) <= 0 ? "Enter the price paid"
    : !onCredit && !wallet ? "Choose the wallet you paid from"
    : "";

  async function save() {
    setBusy(true);
    try {
      let id = picked?.id;
      if (!id) {
        const created = await api<TradeInItem>("/api/v1/items", {
          method: "POST",
          body: { name: newName.trim(), trackSerial: true, sellingPrice: String(num(newSell)), costPrice: "0", condition: "Second-hand" },
        });
        onItemAdded({ ...created, trackSerial: true });
        id = created.id;
      }
      const amount = String(num(price));
      const saved = await api<{ id: string; txnNo: string }>("/api/v1/purchases", {
        method: "POST",
        body: {
          branchId, tradeIn: true,
          seller: { name: sellerName.trim(), phone: sellerPhone.trim() || undefined },
          lines: [{ itemId: id, quantity: 1, unitPrice: amount, imeis: [imeiClean] }],
          paidAmount: onCredit ? "0" : amount,
          walletId: onCredit ? undefined : wallet,
          line: "SALE",
          notes: "Trade-in",
        },
      });
      push("Trade-in recorded — waiting for QC");
      onSaved({ id: saved.id, txnNo: saved.txnNo, paid: onCredit ? "0" : toMinor(price).toString() });
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Trade-in phone" footer={<FormFooter problem={missing} busy={busy} onClose={onClose} onSave={save} saveLabel="Buy phone" />}>
      <div className="space-y-4">
        <FormPart icon={UserRound} title="Seller">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Seller name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
            <Input label="Seller phone" inputMode="tel" value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} />
          </div>
        </FormPart>

        <FormPart icon={Smartphone} title="Phone">
          {picked ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <span className="font-medium">{picked.name}</span>
              <button type="button" aria-label="Change phone" onClick={() => setItemId("")} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setNewName(""); }} placeholder="Search phone model"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
              </div>
              {matches.length > 0 && (
                <div className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                  {matches.map((it) => (
                    <button key={it.id} type="button" onClick={() => { setItemId(it.id); setQuery(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800">{it.name}</button>
                  ))}
                </div>
              )}
              {query.trim() && (
                <button type="button" onClick={() => setNewName(query.trim())} className={cn("mt-1 w-full rounded-lg border border-dashed px-3 py-2 text-left text-sm", newName ? "border-blue-500 text-blue-700 dark:text-blue-300" : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300")}>
                  <span>Add as a new phone: </span><b>{query.trim()}</b>
                </button>
              )}
              {newName && (
                <div className="mt-2">
                  <Input label="Selling price (optional)" inputMode="decimal" value={newSell} onChange={(e) => setNewSell(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <Input label="IMEI" value={imei} onChange={(e) => setImei(e.target.value)} className="font-mono" />
        </FormPart>

        <FormPart icon={WalletIcon} title="Payment">
          <Input label="Price paid" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} />
            <span>Pay the seller later</span>
          </label>
          {!onCredit && (
            <Select label="Paid from" value={wallet} onChange={(e) => setWalletId(e.target.value)}>
              {mmk.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          )}
        </FormPart>

        <p className="text-xs text-gray-500 dark:text-gray-400">The phone waits in Trade-in for QC. Ready to sell puts it in stock; Needs repair sends it to Repairs, and the repair cost is added to the phone&apos;s cost.</p>
      </div>
    </Modal>
  );
}

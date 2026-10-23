"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Empty, Input, Modal, Select, Spinner, Table, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { PageHeader } from "@/components/PageHeader";

interface Biller {
  id: string; name: string; type: string; currency: string;
  currentBalance: string; active: boolean; notes?: string;
  sellPercent: number; refillPercent: number; refillMode: RefillMode;
}
/** On this device, float purchases go into expense without asking. */
const FLOAT_EXPENSE_KEY = "mahar.floatExpense";

interface Txn {
  id: string; txnNo: string; kind: string;
  faceAmount: string; cashAmount: string; profit: string; balanceAfter: string;
  customerPhone?: string; note?: string; createdAt: string;
  voidedAt?: string | null; voidReason?: string | null;
  biller: { name: string; type: string; deletedAt?: string | null };
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

const TYPE_LABEL: Record<string, string> = {
  TOPUP_CARD: "Top-up card",
  ELOAD: "E-load",
};

const num = (v: string) => Number(v.replace(/,/g, "")) || 0;

interface Summary {
  soldFace: string; soldCash: string; soldCount: number;
  refillFace: string; refillCash: string; refillCount: number; profit: string;
}

/** Today in the shop's own time zone, as YYYY-MM-DD for the date picker. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** "+2%" / "−3%"; empty when there is no percentage. */
type RefillMode = "BONUS" | "DISCOUNT";

/** One line on the card saying what the biller's deal is. */
function dealLabel(b: Biller): string[] {
  const out: string[] = [];
  if (b.sellPercent) out.push(`Sell: ${b.sellPercent}% back`);
  if (b.refillPercent) out.push(b.refillMode === "BONUS" ? `Refill: +${b.refillPercent}% bonus` : `Refill: −${b.refillPercent}% off`);
  return out;
}

const KIND_LABEL: Record<string, string> = {
  TOPUP: "Bought float",
  SALE: "Sold top-up",
  ADJUST: "Adjustment",
};

export default function BillersPage() {
  const [billers, setBillers] = useState<Biller[] | null>(null);
  const [totalFloat, setTotalFloat] = useState("0");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [filter, setFilter] = useState("");
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [voiding, setVoiding] = useState<Txn | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [rating, setRating] = useState<Biller | null>(null);
  const [rates, setRates] = useState({ name: "", sellPercent: "", refillPercent: "", refillMode: "DISCOUNT" as RefillMode });
  const [removing, setRemoving] = useState<Biller | null>(null);
  // After "Bought float": ask whether the cash paid goes into expense. "always" skips the question.
  const [floatAsk, setFloatAsk] = useState<{ id: string; txnNo: string; biller: string; cash: string } | null>(null);
  // Read once on first render; it only shows inside dialogs, never in the server-rendered page.
  const [floatAlways, setFloatAlways] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(FLOAT_EXPENSE_KEY) === "always"; } catch { return false; }
  });
  const [rememberFloat, setRememberFloat] = useState(false);
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const [trading, setTrading] = useState<{ biller: Biller; kind: string } | null>(null);
  const [trade, setTrade] = useState({ faceAmount: "", leftAmount: "", cashAmount: "", cashTouched: false, walletId: "", customerPhone: "", note: "" });
  const [form, setForm] = useState({ name: "", type: "TOPUP_CARD", openingBalance: "", notes: "", sellPercent: "", refillPercent: "", refillMode: "DISCOUNT" as RefillMode });
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ billers: Biller[]; totalFloat: string }>("/api/v1/billers?all=1")
      // A to Z by name, ignoring capitals, so "mpt" and "MPT" sit together.
      .then((d) => { setBillers([...d.billers].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))); setTotalFloat(d.totalFloat); })
      .catch((e) => push(e.message, "error"));
    const params = new URLSearchParams({ date, pageSize: "200", ...(filter ? { billerId: filter } : {}) });
    api<{ txns: Txn[]; summary: Summary }>(`/api/v1/billers/txns?${params}`)
      .then((d) => { setTxns(d.txns); setSummary(d.summary); })
      .catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push, filter, date]);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/billers", {
        method: "POST",
        body: {
          name: form.name,
          type: form.type,
          openingBalance: form.openingBalance || "0",
          notes: form.notes || undefined,
          sellPercent: num(form.sellPercent),
          refillPercent: num(form.refillPercent),
          refillMode: form.refillMode,
        },
      });
      push("Biller added");
      setShowNew(false);
      setForm({ name: "", type: "TOPUP_CARD", openingBalance: "", notes: "", sellPercent: "", refillPercent: "", refillMode: "DISCOUNT" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // The float the operator holds now, in kyat. Typing the amount works out what is left, and
  // typing what is left (read off the operator's app) works out the amount.
  const current = trading ? Number(trading.biller.currentBalance) / 100 : 0;
  const face = num(trade.faceAmount);
  // The biller's deal. Selling: the operator puts sellPercent of the amount back into the
  // balance (sell 15,000, 1,000 comes back). Refilling: BONUS adds refillPercent to the
  // balance (pay 100,000, get 106,000); DISCOUNT takes it off the cash (get 100,000, pay 94,000).
  const sellRate = trading?.kind === "SALE" ? trading.biller.sellPercent / 100 : 0;
  const refillRate = trading?.kind === "TOPUP" ? trading.biller.refillPercent / 100 : 0;
  const bonus = trading?.biller.refillMode === "BONUS";
  const commission = Math.max(Math.round(face * sellRate), 0);
  /** How much the balance moves for a given amount. */
  const moveFor = (amount: number) =>
    trading?.kind === "SALE" ? -amount + Math.round(amount * sellRate) : amount;
  const autoCash = Math.max(
    trading?.kind === "TOPUP"
      ? Math.round(bonus ? face / (1 + refillRate) : face * (1 - refillRate))
      : face,
    0,
  );
  const cash = trade.cashTouched ? num(trade.cashAmount) : autoCash;
  // What the shop makes on this trade, shown before it is saved so a wrong figure is
  // caught at the counter rather than in a month-end report.
  const margin = trading?.kind === "TOPUP" ? face - cash : trading?.kind === "SALE" ? cash - face + commission : 0;
  const amountOk = trading?.kind === "ADJUST" ? face !== 0 : face > 0;
  const round2 = (n: number) => String(Math.round(n * 100) / 100);

  function onAmount(value: string) {
    const v = num(value);
    setTrade({ ...trade, faceAmount: value, leftAmount: value.trim() ? round2(current + moveFor(v)) : "" });
  }

  function onLeft(value: string) {
    const v = num(value);
    if (!value.trim()) { setTrade({ ...trade, leftAmount: value, faceAmount: "" }); return; }
    // Selling with commission: the balance fell by amount × (1 − rate), so divide it back out.
    const amount = trading?.kind === "SALE" ? (current - v) / (1 - sellRate) : v - current;
    setTrade({ ...trade, leftAmount: value, faceAmount: String(Math.round(amount)) });
  }

  /** On a bonus refill the shop counts the cash it pays, so typing the cash works out the balance added. */
  function onCash(value: string) {
    if (trading?.kind === "TOPUP" && bonus && value.trim()) {
      const added = Math.round(num(value) * (1 + refillRate));
      setTrade({ ...trade, cashAmount: value, cashTouched: true, faceAmount: String(added), leftAmount: round2(current + added) });
      return;
    }
    setTrade({ ...trade, cashAmount: value, cashTouched: true });
  }

  function startTrade(biller: Biller, kind: string) {
    setTrading({ biller, kind });
    setTrade({
      faceAmount: "",
      leftAmount: "",
      cashAmount: "",
      cashTouched: false,
      walletId: wallets.find((w) => w.currency === "MMK")?.id ?? "",
      customerPhone: "",
      note: "",
    });
  }

  async function applyTrade() {
    if (!trading) return;
    setBusy(true);
    try {
      const saved = await api<{ id: string; txnNo: string; cashAmount: string }>("/api/v1/billers/txns", {
        method: "POST",
        body: {
          billerId: trading.biller.id,
          kind: trading.kind,
          faceAmount: String(face),
          cashAmount: trading.kind === "ADJUST" ? "0" : String(cash),
          commission: trading.kind === "SALE" ? String(commission) : "0",
          walletId: trading.kind === "ADJUST" ? undefined : (trade.walletId || undefined),
          customerPhone: trade.customerPhone || undefined,
          note: trade.note || undefined,
        },
      });
      push(KIND_LABEL[trading.kind] ?? "Saved");
      // A float purchase paid in cash: add it to expense, asking first unless told not to.
      if (trading.kind === "TOPUP" && cash > 0 && trade.walletId) {
        const ask = { id: saved.id, txnNo: saved.txnNo, biller: trading.biller.name, cash: saved.cashAmount };
        if (floatAlways) addFloatExpense(ask, true);
        else { setRememberFloat(false); setFloatAsk(ask); }
      }
      setTrading(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addFloatExpense(ask: { id: string; txnNo: string; cash: string }, auto = false) {
    try {
      await api(`/api/v1/billers/txns/${ask.id}/expense`, { method: "POST" });
      push(`${fmtMoney(ask.cash)} added to expense${auto ? " (auto)" : ""}`);
      if (rememberFloat) {
        try { localStorage.setItem(FLOAT_EXPENSE_KEY, "always"); } catch { /* private mode */ }
        setFloatAlways(true);
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not add to expense", "error");
    } finally {
      setFloatAsk(null);
    }
  }

  function askAgain() {
    try { localStorage.removeItem(FLOAT_EXPENSE_KEY); } catch { /* private mode */ }
    setFloatAlways(false);
  }

  async function applyVoid() {
    if (!voiding) return;
    setBusy(true);
    try {
      await api(`/api/v1/billers/txns/${voiding.id}/void`, { method: "POST", body: { reason: voidReason } });
      push(`${voiding.txnNo} voided`);
      setVoiding(null); setVoidReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  /** A biller still holding a balance is first adjusted to zero, so the books show where
   *  that balance went, and then removed. */
  async function removeBiller() {
    if (!removing) return;
    setBusy(true);
    try {
      const balance = Number(removing.currentBalance) / 100;
      if (balance !== 0) {
        await api("/api/v1/billers/txns", {
          method: "POST",
          body: { billerId: removing.id, kind: "ADJUST", faceAmount: String(-balance), cashAmount: "0", note: "Set to zero before deleting" },
        });
      }
      await api(`/api/v1/billers/${removing.id}`, { method: "DELETE" });
      push(`${removing.name} deleted`);
      if (filter === removing.id) setFilter("");
      setRemoving(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveRates() {
    if (!rating) return;
    setBusy(true);
    try {
      await api(`/api/v1/billers/${rating.id}`, {
        method: "PATCH",
        body: { name: rates.name.trim(), sellPercent: num(rates.sellPercent), refillPercent: num(rates.refillPercent), refillMode: rates.refillMode },
      });
      push("Saved");
      setRating(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!billers) return <Spinner />;


  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader title={<>Top-up Billers</>}>
        {hasPerm("biller.manage") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New biller</Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></Button>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <Button size="sm" variant="ghost" disabled={date >= today()} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day"><ChevronRight size={16} /></Button>
          {date !== today() && <Button size="sm" variant="secondary" onClick={() => setDate(today())}>Today</Button>}
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
          <option value="">All billers</option>
          {billers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="col-span-2 space-y-1 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 lg:col-span-1">
          <div className="text-xs font-medium text-blue-700 dark:text-blue-300">{date === today() ? "Today's sales total" : "Sales total"}</div>
          <div className="text-2xl font-bold tabular-nums">{fmtMoney(summary?.soldFace ?? "0")}</div>
          <div className="text-xs text-gray-500"><span className="tabular-nums">{summary?.soldCount ?? 0}</span> sales</div>
        </Card>
        <Card className="col-span-2 space-y-1 border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 lg:col-span-1">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Stock value total</div>
          <div className={`text-2xl font-bold tabular-nums ${Number(totalFloat) < 0 ? "text-red-600" : ""}`}>{fmtMoney(totalFloat)}</div>
          <div className="text-xs text-gray-500">Held with all billers now</div>
        </Card>
        <Card className="space-y-1">
          <div className="text-xs text-gray-500">Cash received</div>
          <div className="text-lg font-bold tabular-nums text-green-600">{fmtMoney(summary?.soldCash ?? "0")}</div>
        </Card>
        <Card className="space-y-1">
          <div className="text-xs text-gray-500">Refilled</div>
          <div className="text-lg font-bold tabular-nums">{fmtMoney(summary?.refillFace ?? "0")}</div>
          <div className="text-xs text-gray-500">Cash paid <span className="tabular-nums">{fmtMoney(summary?.refillCash ?? "0")}</span></div>
        </Card>
        <Card className="col-span-2 space-y-1 lg:col-span-1">
          <div className="text-xs text-gray-500">Margin</div>
          <div className={`text-lg font-bold tabular-nums ${Number(summary?.profit ?? 0) < 0 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(summary?.profit ?? "0")}</div>
        </Card>
      </div>

      {billers.length === 0 ? (
        <Card><Empty message="No billers yet. Add the operators this shop buys float from." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {billers.map((b) => (
            <Card key={b.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-gray-500">{TYPE_LABEL[b.type] ?? b.type}</div>
                </div>
                <div className="flex items-center gap-1">
                  {!b.active && <span className="text-xs text-gray-400">off</span>}
                  {hasPerm("biller.manage") && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800"
                      onClick={() => { setRating(b); setRates({ name: b.name, sellPercent: b.sellPercent ? String(b.sellPercent) : "", refillPercent: b.refillPercent ? String(b.refillPercent) : "", refillMode: b.refillMode === "BONUS" ? "BONUS" : "DISCOUNT" }); }}
                    >
                      <Pencil size={13} />Edit
                    </button>
                  )}
                </div>
              </div>
              {dealLabel(b).length > 0 && (
                <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                  {dealLabel(b).map((t) => <span key={t}>{t}</span>)}
                </div>
              )}
              <div className={`text-xl font-bold tabular-nums ${Number(b.currentBalance) < 0 ? "text-red-600" : ""}`}>
                {fmtMoney(b.currentBalance)}
              </div>
              {hasPerm("biller.trade") && b.active && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => startTrade(b, "SALE")}>Sell</Button>
                  <Button size="sm" variant="secondary" onClick={() => startTrade(b, "TOPUP")}>Buy float</Button>
                  <Button size="sm" variant="secondary" onClick={() => startTrade(b, "ADJUST")}>Adjust</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}



      <h2 className="pt-2 font-semibold">Movements</h2>
      {txns.length === 0 ? (
        <Card><Empty message="Nothing recorded on this day." /></Card>
      ) : (
        <Table
          headers={["No", "Biller", "What", "Face", "Cash", "Margin", "Float after", ""]}
          rightAlign={[3, 4, 5, 6]}
        >
          {txns.map((t) => (
            <tr key={t.id} className={t.voidedAt ? "text-gray-400 line-through decoration-gray-400" : ""}>
              <td className="px-3 py-2.5">
                <div className="font-mono text-xs">{t.txnNo}</div>
                <div className="text-xs text-gray-500">{fmtDateTime(t.createdAt)}</div>
              </td>
              <td className="px-3 py-2.5">
                <div>{t.biller.name}</div>
                {t.customerPhone && <div className="text-xs text-gray-500">{t.customerPhone}</div>}
              </td>
              <td className="px-3 py-2.5 text-sm">
                {KIND_LABEL[t.kind] ?? t.kind}
                {t.voidedAt && <div className="inline-block text-xs font-semibold text-red-600" title={t.voidReason ?? ""}>&nbsp;Voided</div>}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.faceAmount)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.cashAmount)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${Number(t.profit) < 0 ? "text-red-600" : Number(t.profit) > 0 ? "text-green-600" : "text-gray-400"}`}>
                {fmtMoney(t.profit)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.balanceAfter)}</td>
              <td className="px-3 py-2.5 text-right">
                {!t.voidedAt && !t.biller.deletedAt && hasPerm("biller.trade") && (
                  <Button size="sm" variant="ghost" onClick={() => { setVoiding(t); setVoidReason(""); }}>Void</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New biller">
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mytel" />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="TOPUP_CARD">Top-up card</option>
            <option value="ELOAD">E-load</option>
          </Select>
          <Input
            label="Float held now"
            value={form.openingBalance}
            onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
            placeholder="0"
          />
          <p className="text-xs text-gray-500">
            What the operator is holding for this shop today. A minus figure is fine if the
            shop has sold ahead of paying.
          </p>
          <DealFields value={form} onChange={(v) => setForm({ ...form, ...v })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.name.trim()}>{busy ? "Saving…" : "Add"}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(trading)}
        onClose={() => setTrading(null)}
        title={trading ? `${trading.biller.name} — ${KIND_LABEL[trading.kind]}` : ""}
      >
        {trading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
              <span className="text-gray-500">Balance now</span>
              <b className="tabular-nums">{fmtMoney(trading.biller.currentBalance)}</b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={trading.kind === "SALE" ? "Sold amount" : trading.kind === "TOPUP" ? "Balance added" : "Correct by"}
                value={trade.faceAmount}
                inputMode="decimal"
                autoFocus
                onChange={(e) => onAmount(e.target.value)}
                placeholder={trading.kind === "ADJUST" ? "-5000" : "10000"}
              />
              <Input
                label={trading.kind === "ADJUST" ? "Actual balance" : "Balance left"}
                value={trade.leftAmount}
                inputMode="decimal"
                onChange={(e) => onLeft(e.target.value)}
                placeholder={String(current)}
              />
            </div>
            <p className="text-xs text-gray-500">
              {trading.kind === "ADJUST" ? "Type the balance the operator shows; the difference is worked out." : "Type either one; the other is worked out."}
            </p>
            {trade.faceAmount.trim() !== "" && !amountOk && (
              <p className="text-xs text-red-600">
                {trading.kind === "SALE" ? "Balance left must be lower than the balance now." : trading.kind === "TOPUP" ? "Balance left must be higher than the balance now." : "That is the same as the balance now."}
              </p>
            )}
            {trading.kind !== "ADJUST" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={trading.kind === "TOPUP" ? "Cash paid" : "Cash received"}
                    value={trade.cashTouched ? trade.cashAmount : (face > 0 ? String(autoCash) : "")}
                    inputMode="decimal"
                    onChange={(e) => onCash(e.target.value)}
                    placeholder="0"
                  />
                  <Select label={trading.kind === "TOPUP" ? "Paid out of" : "Paid into"} value={trade.walletId} onChange={(e) => setTrade({ ...trade, walletId: e.target.value })}>
                    <option value="">Choose…</option>
                    {wallets.filter((w) => w.currency === "MMK").map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                    ))}
                  </Select>
                </div>
                {trading.kind === "SALE" && commission > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Commission back to balance</span>
                    <b className="tabular-nums text-green-600">+{commission.toLocaleString()}</b>
                  </div>
                )}
                {trading.kind === "TOPUP" && refillRate > 0 && face > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>{bonus ? "Bonus added to balance" : "Discount on cash"}</span>
                    <b className="tabular-nums text-green-600">{(face - cash).toLocaleString()}</b>
                  </div>
                )}
                {margin !== 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Margin on this trade</span>
                    <b className={`tabular-nums ${margin < 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmtMoney(String(Math.round(margin * 100)))}
                    </b>
                  </div>
                )}
                {trading.kind === "SALE" && (
                  <Input label="Customer phone" value={trade.customerPhone} onChange={(e) => setTrade({ ...trade, customerPhone: e.target.value })} />
                )}
              </>
            )}
            <Input label="Note" value={trade.note} onChange={(e) => setTrade({ ...trade, note: e.target.value })} />
            {trading.kind === "TOPUP" && floatAlways && (
              <p className="text-xs text-gray-500">The cash paid is added to expense automatically. <button type="button" className="text-blue-600" onClick={askAgain}>Ask me instead</button></p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setTrading(null)}>Cancel</Button>
              <Button onClick={applyTrade} disabled={busy || !amountOk || (trading.kind !== "ADJUST" && cash > 0 && !trade.walletId)}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(floatAsk)} onClose={() => setFloatAsk(null)} title="Add to expense?">
        {floatAsk && (
          <div className="space-y-3">
            <p className="text-sm">
              {`Add ${fmtMoney(floatAsk.cash)} paid for ${floatAsk.biller} float (${floatAsk.txnNo}) to expense as Daily Bill Expense?`}
            </p>
            <p className="text-xs text-gray-500">The money already left the wallet with this purchase; this only records it as an expense, so it is not taken out twice. Reports then count top-up cost from your float purchases.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rememberFloat} onChange={(e) => setRememberFloat(e.target.checked)} />
              Always add, don&apos;t ask again
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setFloatAsk(null)}>No</Button>
              <Button onClick={() => addFloatExpense(floatAsk)}>Yes, add to expense</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title={`Void ${voiding?.txnNo ?? ""}`}>
        {voiding && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {voiding.biller.name} · {KIND_LABEL[voiding.kind] ?? voiding.kind} · {fmtMoney(voiding.faceAmount)}
            </p>
            <p className="text-xs text-gray-500">The balance and the cash go back as they were. The record stays in the list, crossed out.</p>
            <Input label="Reason (required)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Wrong amount" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoiding(null)}>Close</Button>
              <Button variant="danger" onClick={applyVoid} disabled={busy || voidReason.trim().length < 3}>{busy ? "Saving…" : "Void"}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}`}>
        {removing && (
          <div className="space-y-3">
            {Number(removing.currentBalance) !== 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This biller still has a balance of <b className="tabular-nums">{fmtMoney(removing.currentBalance)}</b>. It will be set to 0 with an adjustment, then the biller is deleted.
              </p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">The biller is removed from the list. Its past movements stay in the records.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
              <Button variant="danger" onClick={removeBiller} disabled={busy}>
                {busy ? "Saving…" : Number(removing.currentBalance) !== 0 ? "Set to 0 and delete" : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(rating)} onClose={() => setRating(null)} title="Edit biller">
        <div className="space-y-3">
          <Input label="Name" value={rates.name} onChange={(e) => setRates({ ...rates, name: e.target.value })} />
          <DealFields value={rates} onChange={(v) => setRates({ ...rates, ...v })} />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setRemoving(rating); setRating(null); }}
              className="mr-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 size={15} />Delete biller
            </button>
            <Button variant="secondary" onClick={() => setRating(null)}>Cancel</Button>
            <Button onClick={saveRates} disabled={busy || !rates.name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

type Deal = { sellPercent: string; refillPercent: string; refillMode: RefillMode };

/** The biller's deal: commission back on sales, and how a refill is discounted. Leave a
 *  percent at 0 for a biller that gives nothing. */
/** A percent from two amounts, to four decimals and without trailing zeros. */
function pctFrom(part: number, whole: number): string {
  if (!(whole > 0) || !(part >= 0)) return "";
  return String(Math.round((part / whole) * 100 * 10000) / 10000);
}

function DealFields({ value, onChange }: { value: Deal; onChange: (v: Partial<Deal>) => void }) {
  const refill = num(value.refillPercent);
  // Shops know their deal as two amounts ("get 500,000, pay 484,000"), not as a percent.
  const [calc, setCalc] = useState<{ get: string; pay: string } | null>(null);
  const [sellCalc, setSellCalc] = useState<{ sold: string; back: string } | null>(null);

  function fromAmounts(next: { get: string; pay: string }, mode = value.refillMode) {
    setCalc(next);
    const get = num(next.get);
    const pay = num(next.pay);
    if (get > 0 && pay > 0 && get >= pay) {
      // Discount: the cut is a share of the balance. Bonus: the extra is a share of the cash.
      onChange({ refillPercent: pctFrom(get - pay, mode === "BONUS" ? pay : get) });
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div>
        <Input label="Sell commission %" value={value.sellPercent} inputMode="decimal" placeholder="0" onChange={(e) => onChange({ sellPercent: e.target.value })} />
        <p className="mt-1 text-xs text-gray-500">
          {num(value.sellPercent) > 0
            ? `Sell 15,000 → ${Math.round(15000 * num(value.sellPercent) / 100).toLocaleString()} comes back to the balance.`
            : "0 if nothing comes back when you sell."}
        </p>
        {sellCalc ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input label="Sold" value={sellCalc.sold} inputMode="decimal" placeholder="15000" onChange={(e) => {
              const next = { ...sellCalc, sold: e.target.value };
              setSellCalc(next);
              if (num(next.sold) > 0 && num(next.back) > 0) onChange({ sellPercent: pctFrom(num(next.back), num(next.sold)) });
            }} />
            <Input label="Came back" value={sellCalc.back} inputMode="decimal" placeholder="1000" onChange={(e) => {
              const next = { ...sellCalc, back: e.target.value };
              setSellCalc(next);
              if (num(next.sold) > 0 && num(next.back) > 0) onChange({ sellPercent: pctFrom(num(next.back), num(next.sold)) });
            }} />
          </div>
        ) : (
          <button type="button" className="mt-1 text-xs font-medium text-blue-600 hover:underline" onClick={() => setSellCalc({ sold: "", back: "" })}>
            Work out % from amounts
          </button>
        )}
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium">Refill</span>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 text-xs dark:bg-gray-800">
          {(["BONUS", "DISCOUNT"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange({ refillMode: m }); if (calc) fromAmounts(calc, m); }}
              className={`rounded-md px-2 py-2 font-medium ${value.refillMode === m ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}
            >
              {m === "BONUS" ? "Bonus to balance" : "Discount on cash"}
            </button>
          ))}
        </div>
        <Input label="Refill %" value={value.refillPercent} inputMode="decimal" placeholder="0" onChange={(e) => onChange({ refillPercent: e.target.value })} />
        <p className="text-xs text-gray-500">
          {refill <= 0
            ? "0 if the refill has no bonus or discount."
            : value.refillMode === "BONUS"
              ? `Pay 100,000 → balance gets ${Math.round(100000 * (1 + refill / 100)).toLocaleString()}.`
              : `Get 100,000 balance → pay ${Math.round(100000 * (1 - refill / 100)).toLocaleString()}.`}
        </p>
        {calc ? (
          <div className="grid grid-cols-2 gap-2">
            <Input label="Balance you get" value={calc.get} inputMode="decimal" placeholder="500000" onChange={(e) => fromAmounts({ ...calc, get: e.target.value })} />
            <Input label="Cash you pay" value={calc.pay} inputMode="decimal" placeholder="484000" onChange={(e) => fromAmounts({ ...calc, pay: e.target.value })} />
          </div>
        ) : (
          <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={() => setCalc({ get: "", pay: "" })}>
            Work out % from amounts
          </button>
        )}
      </div>
    </div>
  );
}

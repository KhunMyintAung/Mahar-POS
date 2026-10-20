"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Smartphone } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Empty, Input, Modal, Select, Spinner, Table, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Biller {
  id: string; name: string; type: string; currency: string;
  currentBalance: string; active: boolean; notes?: string;
}
interface Txn {
  id: string; txnNo: string; kind: string;
  faceAmount: string; cashAmount: string; profit: string; balanceAfter: string;
  customerPhone?: string; note?: string; createdAt: string;
  biller: { name: string; type: string };
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

const TYPE_LABEL: Record<string, string> = {
  TOPUP_CARD: "Top-up card",
  ELOAD: "E-load",
};

const num = (v: string) => Number(v.replace(/,/g, "")) || 0;

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
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const [trading, setTrading] = useState<{ biller: Biller; kind: string } | null>(null);
  const [trade, setTrade] = useState({ faceAmount: "", leftAmount: "", cashAmount: "", cashTouched: false, walletId: "", customerPhone: "", note: "" });
  const [form, setForm] = useState({ name: "", type: "TOPUP_CARD", openingBalance: "", notes: "" });
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ billers: Biller[]; totalFloat: string }>("/api/v1/billers?all=1")
      .then((d) => { setBillers(d.billers); setTotalFloat(d.totalFloat); })
      .catch((e) => push(e.message, "error"));
    const params = filter ? `?billerId=${filter}` : "";
    api<{ txns: Txn[] }>(`/api/v1/billers/txns${params}`)
      .then((d) => setTxns(d.txns))
      .catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push, filter]);

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
        },
      });
      push("Biller added");
      setShowNew(false);
      setForm({ name: "", type: "TOPUP_CARD", openingBalance: "", notes: "" });
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
  const sign = trading?.kind === "SALE" ? -1 : 1;
  const face = num(trade.faceAmount);
  const cash = trade.cashTouched ? num(trade.cashAmount) : Math.max(face, 0);
  // What the shop makes on this trade, shown before it is saved so a wrong figure is
  // caught at the counter rather than in a month-end report.
  const margin = trading?.kind === "TOPUP" ? face - cash : trading?.kind === "SALE" ? cash - face : 0;
  const amountOk = trading?.kind === "ADJUST" ? face !== 0 : face > 0;

  function onAmount(value: string) {
    const v = num(value);
    setTrade({ ...trade, faceAmount: value, leftAmount: value.trim() ? String(Math.round((current + sign * v) * 100) / 100) : "" });
  }

  function onLeft(value: string) {
    const v = num(value);
    setTrade({ ...trade, leftAmount: value, faceAmount: value.trim() ? String(Math.round(sign * (v - current) * 100) / 100) : "" });
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
      await api("/api/v1/billers/txns", {
        method: "POST",
        body: {
          billerId: trading.biller.id,
          kind: trading.kind,
          faceAmount: String(face),
          cashAmount: trading.kind === "ADJUST" ? "0" : String(cash),
          walletId: trading.kind === "ADJUST" ? undefined : (trade.walletId || undefined),
          customerPhone: trade.customerPhone || undefined,
          note: trade.note || undefined,
        },
      });
      push(KIND_LABEL[trading.kind] ?? "Saved");
      setTrading(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!billers) return <Spinner />;


  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold">Top-up Billers</h1>
        </div>
        {hasPerm("biller.manage") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New biller</Button>
        )}
      </div>

      <Card className="flex items-center justify-between">
        <span className="text-sm text-gray-500">Float held with all operators</span>
        <b className="text-lg tabular-nums">{fmtMoney(totalFloat)}</b>
      </Card>

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
                {!b.active && <span className="text-xs text-gray-400">off</span>}
              </div>
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

      <div className="flex items-center justify-between gap-2 pt-2">
        <h2 className="font-semibold">Recent movements</h2>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
          <option value="">All billers</option>
          {billers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {txns.length === 0 ? (
        <Card><Empty message="Nothing recorded yet." /></Card>
      ) : (
        <Table
          headers={["No", "Biller", "What", "Face", "Cash", "Margin", "Float after"]}
          rightAlign={[3, 4, 5, 6]}
        >
          {txns.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2.5">
                <div className="font-mono text-xs">{t.txnNo}</div>
                <div className="text-xs text-gray-500">{fmtDateTime(t.createdAt)}</div>
              </td>
              <td className="px-3 py-2.5">
                <div>{t.biller.name}</div>
                {t.customerPhone && <div className="text-xs text-gray-500">{t.customerPhone}</div>}
              </td>
              <td className="px-3 py-2.5 text-sm">{KIND_LABEL[t.kind] ?? t.kind}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.faceAmount)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.cashAmount)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${Number(t.profit) < 0 ? "text-red-600" : Number(t.profit) > 0 ? "text-green-600" : "text-gray-400"}`}>
                {fmtMoney(t.profit)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.balanceAfter)}</td>
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
                label={trading.kind === "SALE" ? "Sold amount" : trading.kind === "TOPUP" ? "Float bought" : "Correct by"}
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
                    value={trade.cashTouched ? trade.cashAmount : (face > 0 ? String(face) : "")}
                    inputMode="decimal"
                    onChange={(e) => setTrade({ ...trade, cashAmount: e.target.value, cashTouched: true })}
                    placeholder="0"
                  />
                  <Select label={trading.kind === "TOPUP" ? "Paid out of" : "Paid into"} value={trade.walletId} onChange={(e) => setTrade({ ...trade, walletId: e.target.value })}>
                    <option value="">Choose…</option>
                    {wallets.filter((w) => w.currency === "MMK").map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                    ))}
                  </Select>
                </div>
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
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setTrading(null)}>Cancel</Button>
              <Button onClick={applyTrade} disabled={busy || !amountOk || (trading.kind !== "ADJUST" && cash > 0 && !trade.walletId)}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

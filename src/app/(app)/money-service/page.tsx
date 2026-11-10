"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, cn, useToast } from "@/components/ui";
import { useAuth, useCurrency } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { PageHeader } from "@/components/PageHeader";

type Kind = "TRANSFER" | "CASHOUT";

interface Record_ {
  id: string; txnNo: string; kind: Kind;
  accountWalletId: string; cashWalletId: string;
  amount: string; fee: string;
  customerName?: string | null; customerPhone?: string | null; note?: string | null;
  createdAt: string; voidedAt?: string | null; voidReason?: string | null;
}

interface Wallet { id: string; name: string; type: string; currency: string; currentBalance: string }

const KIND_LABEL: Record<Kind, string> = { TRANSFER: "Money transfer", CASHOUT: "Cash-out" };

const num = (v: string) => parseFloat(v.replace(/,/g, "")) || 0;

/** Transfers and cash-outs done for customers through the shop's KBZPay / Wave account. The
 *  amount swaps between that account and the drawer; the fee is the shop's, filed as income
 *  (Transfer & Cash-out Fee) so it shows under Other income. */
export default function MoneyServicePage() {
  const cur = useCurrency();
  const [records, setRecords] = useState<Record_[] | null>(null);
  const [today, setToday] = useState<{ kind: Kind; count: number; amount: string; fee: string }[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "TRANSFER" as Kind, accountWalletId: "", cashWalletId: "", amount: "", fee: "", customerName: "", customerPhone: "", note: "" });
  const [voiding, setVoiding] = useState<Record_ | null>(null);
  const [reason, setReason] = useState("");
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<{ records: Record_[]; today: { kind: Kind; count: number; amount: string; fee: string }[] }>("/api/v1/money-service?pageSize=100")
      .then((d) => { setRecords(d.records); setToday(d.today); })
      .catch((e) => push(e.message, "error"));
    api<Wallet[]>("/api/v1/wallets").then((list) => setWallets(list.filter((w) => w.currency === cur))).catch(() => {});
  }, [push, cur]);

  useEffect(load, [load]);

  function open(kind: Kind) {
    // The account is the KBZPay / Wave wallet (a mobile wallet), the drawer the cash one.
    const account = wallets.find((w) => w.type === "MOBILE") ?? wallets.find((w) => w.type !== "CASH");
    const cash = wallets.find((w) => w.type === "CASH" && w.id !== account?.id) ?? wallets.find((w) => w.id !== account?.id);
    setForm({ kind, accountWalletId: account?.id ?? "", cashWalletId: cash?.id ?? "", amount: "", fee: "", customerName: "", customerPhone: "", note: "" });
    setShowNew(true);
  }

  async function save() {
    setBusy(true);
    try {
      await api("/api/v1/money-service", { method: "POST", body: { ...form, fee: form.fee || "0" } });
      push(form.kind === "TRANSFER" ? "Money transfer recorded" : "Cash-out recorded");
      setShowNew(false);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    if (!voiding) return;
    setBusy(true);
    try {
      await api(`/api/v1/money-service/${voiding.id}/void`, { method: "POST", body: { reason } });
      push("Voided");
      setVoiding(null);
      setReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!records) return <Spinner />;

  const walletName = (id: string) => wallets.find((w) => w.id === id)?.name ?? "-";
  const account = wallets.find((w) => w.id === form.accountWalletId);
  const cash = wallets.find((w) => w.id === form.cashWalletId);
  const amount = num(form.amount);
  const fee = num(form.fee);
  const transfer = form.kind === "TRANSFER";
  const feeTotal = today.reduce((a, t) => a + BigInt(t.fee), 0n);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader
        title={<>Transfer &amp; Cash-out</>}
        lead={
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {"Customers' money transfers and cash-outs through KBZPay / Wave. The fee goes into income (Other income) by itself."}
          </span>
        }
      >
        <div className="flex gap-2">
          <Button onClick={() => open("TRANSFER")}><ArrowLeftRight size={16} className="mr-1 inline" />Money transfer</Button>
          <Button variant="secondary" onClick={() => open("CASHOUT")}>Cash-out</Button>
        </div>
      </PageHeader>

      <div className="grid gap-2 sm:grid-cols-3">
        {(["TRANSFER", "CASHOUT"] as Kind[]).map((k) => {
          const t = today.find((x) => x.kind === k);
          return (
            <Card key={k} className="p-3">
              <div className="text-xs text-gray-500">{`Today's ${k === "TRANSFER" ? "transfers" : "cash-outs"}`}</div>
              <div className="text-base font-bold tabular-nums">{fmtMoney(t?.amount ?? "0")}</div>
              <div className="text-xs text-gray-500">{t?.count ?? 0} × · <span>Fee</span> {fmtMoney(t?.fee ?? "0")}</div>
            </Card>
          );
        })}
        <Card className="p-3">
          <div className="text-xs text-gray-500">{"Today's fees (income)"}</div>
          <div className="text-base font-bold tabular-nums text-green-600">{fmtMoney(feeTotal.toString())}</div>
        </Card>
      </div>

      {records.length === 0 ? (
        <Card><Empty message="No transfers or cash-outs yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Kind", "Customer", "KBZPay / Wave", "Cash", "Amount", "Fee", ""]} rightAlign={[6, 7]}>
          {records.map((r) => (
            <tr key={r.id} className={cn(r.voidedAt && "text-gray-400 line-through")}>
              <td className="px-3 py-2 text-xs">{r.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(r.createdAt)}</td>
              <td className="px-3 py-2 text-xs font-medium">{KIND_LABEL[r.kind]}</td>
              <td className="px-3 py-2 text-xs">{[r.customerName, r.customerPhone].filter(Boolean).join(" · ") || "-"}</td>
              <td className="px-3 py-2 text-xs">{walletName(r.accountWalletId)} {r.kind === "TRANSFER" ? "−" : "+"}</td>
              <td className="px-3 py-2 text-xs">{walletName(r.cashWalletId)} {r.kind === "TRANSFER" ? "+" : "−"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-600">{fmtMoney(r.fee)}</td>
              <td className="px-3 py-2">
                {!r.voidedAt && hasPerm("wallet.reverse") && (
                  <Button size="sm" variant="ghost" onClick={() => { setVoiding(r); setReason(""); }}>Void</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title={KIND_LABEL[form.kind]}>
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm dark:bg-gray-800">
            {(["TRANSFER", "CASHOUT"] as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={cn("min-h-9 flex-1 rounded-md px-2 font-medium", form.kind === k ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={transfer ? "Send from (KBZPay / Wave)" : "Received into (KBZPay / Wave)"} value={form.accountWalletId} onChange={(e) => setForm({ ...form, accountWalletId: e.target.value })}>
              <option value="">Choose…</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>)}
            </Select>
            <Select label={transfer ? "Cash taken into" : "Cash paid out of"} value={form.cashWalletId} onChange={(e) => setForm({ ...form, cashWalletId: e.target.value })}>
              <option value="">Choose…</option>
              {wallets.filter((w) => w.id !== form.accountWalletId).map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>)}
            </Select>
            <Input label="Amount" value={form.amount} inputMode="decimal" autoFocus onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="100000" />
            <Input label="Fee (shop's income)" value={form.fee} inputMode="decimal" onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="0" />
            <Input label="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            <Input label="Customer phone" value={form.customerPhone} inputMode="tel" onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </div>
          <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          {amount > 0 && account && cash && (
            <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
              {transfer ? (
                <>
                  <div className="flex justify-between"><span>Customer pays in cash</span><b className="tabular-nums">{(amount + fee).toLocaleString()}</b></div>
                  <div className="flex justify-between text-gray-500"><span>{account.name}</span><span className="tabular-nums">−{amount.toLocaleString()}</span></div>
                  <div className="flex justify-between text-gray-500"><span>{cash.name}</span><span className="tabular-nums">+{(amount + fee).toLocaleString()}</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span>Give the customer in cash</span><b className="tabular-nums">{(amount - fee).toLocaleString()}</b></div>
                  <div className="flex justify-between text-gray-500"><span>{account.name}</span><span className="tabular-nums">+{amount.toLocaleString()}</span></div>
                  <div className="flex justify-between text-gray-500"><span>{cash.name}</span><span className="tabular-nums">−{(amount - fee).toLocaleString()}</span></div>
                </>
              )}
              {fee > 0 && <div className="flex justify-between text-green-600"><span>Fee into income</span><b className="tabular-nums">{fee.toLocaleString()}</b></div>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button disabled={busy || amount <= 0 || fee < 0 || (!transfer && fee >= amount) || !form.accountWalletId || !form.cashWalletId} onClick={save}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="Void">
        {voiding && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {voiding.txnNo} · {KIND_LABEL[voiding.kind]} · {fmtMoney(voiding.amount)}. <span>Both wallet movements and the fee will be put back.</span>
            </p>
            <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoiding(null)}>Cancel</Button>
              <Button variant="danger" onClick={doVoid} disabled={busy || reason.trim().length < 3}>Void</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, Copy, ExternalLink, Lock, Send } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { fmtMsp } from "@/lib/msp";
import { parseMspAmount } from "@/lib/mspWallet";
import { Button, Card, Input, Modal, Spinner, Empty, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { MSP_INFO_URL } from "@/components/MspRewardsCard";
import { MspLogo } from "@/components/MspLogo";

interface Summary {
  walletId: string; balance: string; earned: string; onChain: string; rewardsOn: boolean; address: string | null;
  feeCenti: string; minCenti: string; explorer: string | null;
  history: { id: string; at: string; kind: "REWARD" | "SENT" | "RECEIVED" | "WITHDRAW"; amount: string; title: string; status: string | null; link: string | null }[];
}
interface Price { priceUsd: number; change24h: number }

/** The shop's MSP wallet: the points it earned for using Mahar POS and got from other shops.
 *  Sending to another shop is free; taking MSP out to the shop's own BNB Chain wallet is a
 *  chain transaction, so it has a fee. */
export default function MspWalletPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [modal, setModal] = useState<"send" | "withdraw" | null>(null);
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const owner = hasPerm("settings.manage");

  const load = useCallback(() => {
    api<Summary>("/api/v1/msp/wallet").then(setS).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);
  useEffect(() => {
    api<{ price: Price | null }>("/api/v1/msp/price").then((p) => setPrice(p.price)).catch(() => {});
  }, []);

  if (!s) return <Spinner />;
  const balance = BigInt(s.balance);
  const usd = price ? (Number(balance) / 100) * price.priceUsd : null;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageHeader title="MSP Wallet">
        {owner && <Button variant="secondary" onClick={() => setModal("send")} disabled={balance <= 0n}><Send size={15} className="mr-1 inline" />Send to a shop</Button>}
        {owner && <Button onClick={() => setModal("withdraw")} disabled={balance <= 0n}><ArrowDownToLine size={15} className="mr-1 inline" />Withdraw</Button>}
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500"><MspLogo size={16} />Balance</div>
            <div className="text-3xl font-bold tabular-nums">{fmtMsp(balance)} <span className="text-base font-semibold text-gray-500">MSP</span></div>
            {s.onChain !== "0" && <div className="text-xs text-gray-500 tabular-nums">+ {fmtMsp(s.onChain)} MSP already in your BNB Chain wallet · {fmtMsp(s.earned)} MSP earned in all</div>}
            {usd !== null && <div className="text-xs text-gray-500 tabular-nums">≈ ${usd < 1 ? usd.toPrecision(2) : usd.toFixed(2)} · 1 MSP ${price!.priceUsd.toPrecision(3)}</div>}
          </div>
          <WalletIdChip id={s.walletId} />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Mahar POS ဆိုင်အချင်းချင်း လွှဲတာ အခမဲ့ပါ။ ကိုယ့် BNB Chain Wallet ထဲ ထုတ်ယူရင် Fee {fmtMsp(s.feeCenti)} MSP ကျပါမယ်
          (အနည်းဆုံး {fmtMsp(s.minCenti)} MSP)။
          {!s.rewardsOn && owner && <> Earn MSP every day you use Mahar POS: <Link href="/settings#points" className="text-blue-600 hover:underline">switch it on in Settings → Points</Link>.</>}
          {" "}<a href={MSP_INFO_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">What is MSP?</a>
        </p>
      </Card>

      <AddressCard address={s.address} canEdit={owner} onSaved={setS} />

      <Card>
        <h3 className="mb-2 text-sm font-semibold">History</h3>
        {s.history.length === 0 ? <Empty message="Nothing yet" /> : (
          <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {s.history.map((h) => {
              const amt = BigInt(h.amount);
              return (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{h.title}</div>
                    <div className="text-xs text-gray-500">
                      {fmtDateTime(h.at)}
                      {h.status && <> · {h.link
                        ? <a href={h.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">{h.status}<ExternalLink size={10} /></a>
                        : h.status}</>}
                    </div>
                  </div>
                  <span className={cn("shrink-0 font-medium tabular-nums", amt > 0n ? "text-green-600" : amt < 0n ? "text-gray-700 dark:text-gray-300" : "text-gray-400")}>
                    {amt > 0n ? "+" : amt < 0n ? "−" : ""}{fmtMsp(amt < 0n ? -amt : amt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {modal === "send" && <SendModal balance={balance} onClose={() => setModal(null)} onDone={(n) => { setS(n); setModal(null); }} />}
      {modal === "withdraw" && <WithdrawModal s={s} onClose={() => setModal(null)} onDone={(n) => { setS(n); setModal(null); }} />}
    </div>
  );
}

function WalletIdChip({ id }: { id: string }) {
  const { push } = useToast();
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(id).then(() => push("Wallet ID copied"), () => {})}
      className="rounded-lg border border-gray-200 px-3 py-1.5 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      <div className="text-[11px] text-gray-500">This shop&apos;s MSP wallet ID</div>
      <div className="flex items-center gap-1.5 font-mono text-sm font-semibold">{id}<Copy size={12} className="text-gray-400" /></div>
    </button>
  );
}

/** The shop's own BNB Chain wallet for withdrawals. Once saved it shows locked; changing it
 *  is a deliberate step. */
function AddressCard({ address, canEdit, onSaved }: { address: string | null; canEdit: boolean; onSaved: (s: Summary) => void }) {
  const { push } = useToast();
  const [editing, setEditing] = useState(!address);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const next = await api<Summary>("/api/v1/msp/wallet/address", { method: "PUT", body: { address: text } });
      onSaved(next);
      setEditing(false);
      setText("");
      push("Wallet saved and locked");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold">Withdraw to (your BNB Chain wallet)</h3>
      {address && !editing ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50/60 p-3 dark:border-green-900/60 dark:bg-green-950/20">
          <Lock size={18} className="shrink-0 text-green-700 dark:text-green-400" />
          <div className="min-w-0 flex-1">
            <div className="break-all font-mono text-sm">{address}</div>
            <div className="text-xs text-green-700 dark:text-green-400">Saved and locked · withdrawals go only here</div>
          </div>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => { if (confirm("Change the wallet withdrawals go to?")) setEditing(true); }}>Change</Button>
          )}
        </div>
      ) : canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Input label="Wallet address (0x…)" placeholder="0x…" value={text} onChange={(e) => setText(e.target.value)}
              spellCheck={false} autoComplete="off" className="font-mono" />
          </div>
          <Button disabled={busy || !text.trim()} onClick={save}><Lock size={14} className="mr-1 inline" />Save and lock</Button>
          {address && <Button variant="secondary" onClick={() => { setEditing(false); setText(""); }}>Cancel</Button>}
          <p className="w-full text-xs text-gray-500">
            Trust Wallet, MetaMask or Binance Web3 wallet on BNB Chain. No wallet yet? Make one free at{" "}
            <a className="text-blue-600 hover:underline" href="https://token.maharpos.shop/wallet/" target="_blank" rel="noopener noreferrer">token.maharpos.shop/wallet</a>.
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">The shop owner has not saved a wallet yet.</p>
      )}
    </Card>
  );
}

function SendModal({ balance, onClose, onDone }: { balance: bigint; onClose: () => void; onDone: (s: Summary) => void }) {
  const { push } = useToast();
  const [to, setTo] = useState("");
  // The shop name for the ID typed so far; "" when no shop has it.
  const [lookup, setLookup] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const centi = parseMspAmount(amount);
  const id = to.trim();
  const shop = lookup?.id === id ? lookup.name : null;

  useEffect(() => {
    if (!/^(MSP-?)?[0-9a-f]{8}$/i.test(id)) return;
    const t = setTimeout(() => {
      api<{ name: string }>(`/api/v1/msp/wallet/shop?id=${encodeURIComponent(id)}`)
        .then((r) => setLookup({ id, name: r.name }), () => setLookup({ id, name: "" }));
    }, 300);
    return () => clearTimeout(t);
  }, [id]);

  async function send() {
    setBusy(true);
    try {
      onDone(await api<Summary>("/api/v1/msp/wallet/send", { method: "POST", body: { to: to.trim(), amount, note: note.trim() || undefined } }));
      push(`Sent ${amount} MSP to ${shop}`);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Send MSP to a shop">
      <div className="space-y-3">
        <div>
          <Input label="Their MSP wallet ID" placeholder="MSP-1A2B3C4D" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" className="font-mono" />
          {shop && <p className="mt-1 text-sm font-medium text-green-700 dark:text-green-400">→ {shop}</p>}
          {shop === "" && <p className="mt-1 text-xs text-red-600">No shop has that MSP wallet ID</p>}
        </div>
        <Input label={`MSP (you have ${fmtMsp(balance)})`} inputMode="decimal" placeholder="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        <p className="text-xs text-gray-500">Free and instant: no chain fee between Mahar POS shops.</p>
        <Button disabled={busy || !shop || !centi || centi > balance} onClick={send} className="w-full"><Send size={15} className="mr-1 inline" />Send</Button>
      </div>
    </Modal>
  );
}

function WithdrawModal({ s, onClose, onDone }: { s: Summary; onClose: () => void; onDone: (s: Summary) => void }) {
  const { push } = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const balance = BigInt(s.balance), fee = BigInt(s.feeCenti), min = BigInt(s.minCenti);
  const centi = parseMspAmount(amount);
  const problem = !centi ? null
    : centi > balance ? "More than the balance"
    : centi < min ? `The smallest withdrawal is ${fmtMsp(min)} MSP` : null;

  async function go() {
    setBusy(true);
    try {
      onDone(await api<Summary>("/api/v1/msp/wallet/withdraw", { method: "POST", body: { amount } }));
      push("Withdrawal on the way");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Withdraw MSP">
      {!s.address ? (
        <p className="text-sm">Save and lock the shop&apos;s BNB Chain wallet on this page first.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-xs dark:bg-gray-800">
            <Lock size={13} className="shrink-0 text-green-700" /><span className="break-all font-mono">{s.address}</span>
          </div>
          <div>
            <Input label={`MSP (you have ${fmtMsp(balance)})`} inputMode="decimal" placeholder={fmtMsp(min)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button type="button" className="mt-1 text-xs text-blue-600 hover:underline" onClick={() => setAmount(fmtMsp(balance))}>Withdraw all</button>
          </div>
          <div className="space-y-1 rounded-lg border border-gray-200 p-2.5 text-sm dark:border-gray-700">
            <div className="flex justify-between"><span className="text-gray-500">Fee (BNB Chain gas)</span><span className="tabular-nums">{fmtMsp(fee)} MSP</span></div>
            <div className="flex justify-between font-semibold"><span>You receive</span><span className="tabular-nums">{centi && centi > fee ? fmtMsp(centi - fee) : "0"} MSP</span></div>
          </div>
          {problem && <p className="text-xs text-red-600">{problem}</p>}
          <p className="text-xs text-gray-500">It reaches the wallet in a few minutes. A withdrawal cannot be undone.</p>
          <Button disabled={busy || !centi || !!problem} onClick={go} className="w-full"><ArrowDownToLine size={15} className="mr-1 inline" />Withdraw</Button>
        </div>
      )}
    </Modal>
  );
}

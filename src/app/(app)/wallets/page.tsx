"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, SlidersHorizontal, Scale, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { minorToDecimalString } from "@/lib/money";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Wallet {
  id: string; name: string; code: string; type: string; currency: string;
  currentBalance: string; minBalance: string; active: boolean; branchId?: string;
  description?: string | null;
}

/** Minor units back into something editable in a text field. */
function fmtInput(minor: string | number | bigint) {
  return minorToDecimalString(BigInt(minor));
}

const emptyWalletForm = (branchId: string) => ({
  name: "", code: "", type: "CASH", currency: "MMK",
  branchId, openingBalance: "0", minBalance: "0",
});

function walletCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [showNew, setShowNew] = useNewModal();
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdjust, setShowAdjust] = useState<Wallet | null>(null);
  const [showReconcile, setShowReconcile] = useState<Wallet | null>(null);
  const [showEdit, setShowEdit] = useState<Wallet | null>(null);
  const [showDelete, setShowDelete] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, branches, defaultBranchId } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState(() => emptyWalletForm(""));
  const [transfer, setTransfer] = useState({ sourceWalletId: "", destWalletId: "", amount: "", rate: "", fee: "0", notes: "" });
  const [adjust, setAdjust] = useState({ direction: "DEBIT", amount: "", reason: "" });
  const [reconcile, setReconcile] = useState({ countedBalance: "", notes: "" });
  const [edit, setEdit] = useState({ name: "", code: "", type: "CASH", minBalance: "0", description: "", active: true });

  const load = useCallback(() => {
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, done: () => void, msg: string) {
    setBusy(true);
    try {
      await fn();
      push(msg);
      done();
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!wallets) return <Spinner />;

  const source = wallets.find((w) => w.id === transfer.sourceWalletId);
  const dest = wallets.find((w) => w.id === transfer.destWalletId);
  const crossCurrency = source && dest && source.currency !== dest.currency;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Wallets</h1>
        <div className="flex flex-wrap gap-2">
          {hasPerm("wallet.transfer") && (
            <Button variant="secondary" onClick={() => setShowTransfer(true)}>
              <ArrowLeftRight size={16} className="mr-1 inline" />Transfer
            </Button>
          )}
          {hasPerm("wallet.create") && (
            <Button onClick={() => { setForm(emptyWalletForm(defaultBranchId || branches[0]?.id || "")); setShowNew(true); }}>
              <Plus size={16} className="mr-1 inline" />New wallet
            </Button>
          )}
        </div>
      </div>

      {wallets.length === 0 ? (
        <Card><Empty message="No wallets" /></Card>
      ) : (
        <Table headers={["Wallet", "Code", "Type", "Currency", "Balance", ""]} rightAlign={[4]}>
          {wallets.map((w) => (
            <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="cursor-pointer px-3 py-2.5 font-medium text-blue-600 hover:underline" onClick={() => router.push(`/wallets/${w.id}`)}>{w.name}</td>
              <td className="px-3 py-2.5 text-xs text-gray-500">{w.code}</td>
              <td className="px-3 py-2.5 text-xs">{w.type}</td>
              <td className="px-3 py-2.5">{w.currency}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${BigInt(w.currentBalance) < BigInt(w.minBalance) ? "text-red-600" : ""}`}>
                {fmtMoney(w.currentBalance)}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-1">
                  {hasPerm("wallet.adjust") && (
                    <Button size="sm" variant="ghost" onClick={() => { setAdjust({ direction: "DEBIT", amount: "", reason: "" }); setShowAdjust(w); }}>
                      <SlidersHorizontal size={14} className="mr-1 inline" />Adjust
                    </Button>
                  )}
                  {hasPerm("wallet.reconcile") && (
                    <Button size="sm" variant="ghost" onClick={() => { setReconcile({ countedBalance: "", notes: "" }); setShowReconcile(w); }}>
                      <Scale size={14} className="mr-1 inline" />Reconcile
                    </Button>
                  )}
                  {hasPerm("wallet.create") && (
                    <Button size="sm" variant="ghost" onClick={() => { setEdit({ name: w.name, code: w.code, type: w.type, minBalance: fmtInput(w.minBalance), description: w.description ?? "", active: w.active }); setShowEdit(w); }}>
                      <Pencil size={14} className="mr-1 inline" />Edit
                    </Button>
                  )}
                  {hasPerm("wallet.create") && (
                    <Button size="sm" variant="ghost" onClick={() => setShowDelete(w)}>
                      <Trash2 size={14} className="mr-1 inline text-red-600" />Delete
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* New wallet */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New wallet">
        <div className="space-y-3">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm((current) => ({
                ...current,
                name,
                code: current.code === walletCode(current.name) || !current.code ? walletCode(name) : current.code,
              }));
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MMK-CASH-2" />
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {/* Written-out values: an option with none submits its own text, which this
                  app translates, so in Myanmar the wallet type posted was a Burmese word. */}
              {["CASH", "BANK", "MOBILE", "AGENT", "CUSTOMER", "EXPENSE", "CLEARING", "CUSTOM"].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="MMK">MMK</option><option value="THB">THB</option>
            </Select>
            <Select label="Branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Opening balance" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} inputMode="decimal" />
            <Input label="Minimum balance alert" value={form.minBalance} onChange={(e) => setForm({ ...form, minBalance: e.target.value })} inputMode="decimal" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              disabled={busy || !form.name || !form.code}
              onClick={() => run(
                () => api("/api/v1/wallets", { method: "POST", body: form }),
                () => { setShowNew(false); setForm(emptyWalletForm(defaultBranchId || branches[0]?.id || "")); },
                "Wallet created"
              )}
            >Create</Button>
          </div>
        </div>
      </Modal>

      {/* Transfer */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Wallet transfer">
        <div className="space-y-3">
          <Select label="From wallet" value={transfer.sourceWalletId} onChange={(e) => setTransfer({ ...transfer, sourceWalletId: e.target.value })}>
            <option value="">Select…</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
          </Select>
          <Select label="To wallet" value={transfer.destWalletId} onChange={(e) => setTransfer({ ...transfer, destWalletId: e.target.value })}>
            <option value="">Select…</option>
            {wallets.filter((w) => w.id !== transfer.sourceWalletId).map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={`Amount${source ? ` (${source.currency})` : ""}`} value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} inputMode="decimal" />
            <Input label="Fee" value={transfer.fee} onChange={(e) => setTransfer({ ...transfer, fee: e.target.value })} inputMode="decimal" />
          </div>
          {crossCurrency && (
            <Input
              label={`Exchange rate (${dest!.currency} per 1 ${source!.currency})`}
              value={transfer.rate}
              onChange={(e) => setTransfer({ ...transfer, rate: e.target.value })}
              inputMode="decimal"
            />
          )}
          <Input label="Notes" value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button
              disabled={busy || !transfer.sourceWalletId || !transfer.destWalletId || !transfer.amount || (!!crossCurrency && !transfer.rate)}
              onClick={() => run(
                () => api("/api/v1/wallet-transfers", { method: "POST", body: { ...transfer, rate: crossCurrency ? transfer.rate : undefined } }),
                () => { setShowTransfer(false); setTransfer({ sourceWalletId: "", destWalletId: "", amount: "", rate: "", fee: "0", notes: "" }); },
                "Transfer completed"
              )}
            >{busy ? "Transferring…" : "Confirm transfer"}</Button>
          </div>
        </div>
      </Modal>

      {/* Adjust */}
      <Modal open={!!showAdjust} onClose={() => setShowAdjust(null)} title={`Adjust ${showAdjust?.name}`}>
        <div className="space-y-3">
          <Select label="Direction" value={adjust.direction} onChange={(e) => setAdjust({ ...adjust, direction: e.target.value })}>
            <option value="DEBIT">Add money (debit)</option>
            <option value="CREDIT">Remove money (credit)</option>
          </Select>
          <Input label="Amount" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} inputMode="decimal" />
          <Input label="Reason (required)" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAdjust(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={busy || !adjust.amount || adjust.reason.trim().length < 3}
              onClick={() => run(
                () => api(`/api/v1/wallets/${showAdjust!.id}/adjust`, { method: "POST", body: adjust }),
                () => setShowAdjust(null),
                "Balance adjusted"
              )}
            >Adjust balance</Button>
          </div>
        </div>
      </Modal>

      {/* Reconcile */}
      <Modal open={!!showReconcile} onClose={() => setShowReconcile(null)} title={`Reconcile ${showReconcile?.name}`}>
        <div className="space-y-3">
          <p className="text-sm">System balance: <b className="tabular-nums">{showReconcile && fmtMoney(showReconcile.currentBalance)} {showReconcile?.currency}</b></p>
          <Input label="Actual counted balance" value={reconcile.countedBalance} onChange={(e) => setReconcile({ ...reconcile, countedBalance: e.target.value })} inputMode="decimal" />
          <Input label="Notes" value={reconcile.notes} onChange={(e) => setReconcile({ ...reconcile, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowReconcile(null)}>Cancel</Button>
            <Button
              disabled={busy || !reconcile.countedBalance}
              onClick={() => run(
                () => api("/api/v1/reconciliations", { method: "POST", body: { walletId: showReconcile!.id, ...reconcile } }),
                () => setShowReconcile(null),
                "Reconciliation saved"
              )}
            >Save reconciliation</Button>
          </div>
        </div>
      </Modal>

      {/* Edit */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit ${showEdit?.name}`}>
        <div className="space-y-3">
          <Input label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Code" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} />
            <Select label="Type" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
              {["CASH", "BANK", "MOBILE", "AGENT", "CUSTOMER", "EXPENSE", "CLEARING", "CUSTOM"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <Input label="Minimum balance" value={edit.minBalance} onChange={(e) => setEdit({ ...edit, minBalance: e.target.value })} inputMode="decimal" />
          <Input label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
            Active
          </label>
          <p className="text-xs text-gray-500">
            Balance and currency are not editable here — the balance comes from the ledger, so use
            Adjust to change it and keep the history in step.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowEdit(null)}>Cancel</Button>
            <Button
              disabled={busy || !edit.name.trim() || !edit.code.trim()}
              onClick={() => run(
                () => api(`/api/v1/wallets/${showEdit!.id}`, { method: "PATCH", body: edit }),
                () => setShowEdit(null),
                "Wallet updated"
              )}
            >Save changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete */}
      <Modal open={!!showDelete} onClose={() => setShowDelete(null)} title={`Delete ${showDelete?.name}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This wallet is removed from the app. Its past entries stay in the ledger and in any
            record that used it, so your history keeps adding up.
          </p>
          {showDelete && BigInt(showDelete.currentBalance) !== 0n ? (
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              This wallet still holds {fmtMoney(showDelete.currentBalance)} {showDelete.currency}.
              Transfer or adjust it to zero first, so the money is not simply hidden.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={busy || !showDelete || BigInt(showDelete.currentBalance) !== 0n}
              onClick={() => run(
                () => api(`/api/v1/wallets/${showDelete!.id}`, { method: "DELETE" }),
                () => setShowDelete(null),
                "Wallet deleted"
              )}
            >Delete wallet</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

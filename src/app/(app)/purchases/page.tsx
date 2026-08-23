"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Purchase {
  id: string; txnNo: string; date: string; total: string; paidAmount: string;
  paymentStatus: string; status: string; supplierName?: string; createdAt: string;
  lines: { id: string; quantity: number; unitCost: string; item: { name: string } }[];
}
interface Item { id: string; name: string; sku: string; costPrice: string }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Contact { id: string; name: string; type: string }
interface Line { itemId: string; quantity: number; unitPrice: string }

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [cancelTarget, setCancelTarget] = useState<Purchase | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const [lines, setLines] = useState<Line[]>([]);
  const [form, setForm] = useState({ supplierId: "", discount: "0", paidAmount: "0", walletId: "", dueDate: "", notes: "" });

  const load = useCallback(() => {
    api<{ purchases: Purchase[] }>("/api/v1/purchases?pageSize=100")
      .then((d) => setPurchases(d.purchases))
      .catch((e) => push(e.message, "error"));
    api<{ items: Item[] }>("/api/v1/items?pageSize=200&active=1").then((d) => setItems(d.items)).catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
    api<{ contacts: Contact[] }>("/api/v1/customers?type=SUPPLIER&pageSize=200")
      .then((d) => setSuppliers(d.contacts)).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  const subtotal = lines.reduce((a, l) => a + l.quantity * (parseFloat(l.unitPrice.replace(/,/g, "")) || 0), 0);
  const total = Math.max(0, subtotal - (parseFloat(form.discount.replace(/,/g, "")) || 0));
  const paid = parseFloat(form.paidAmount.replace(/,/g, "")) || 0;
  const unpaid = total - paid;

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/purchases", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          supplierId: form.supplierId || undefined,
          lines,
          discount: form.discount || "0",
          paidAmount: form.paidAmount || "0",
          walletId: paid > 0 ? form.walletId : undefined,
          dueDate: form.dueDate || undefined,
          notes: form.notes || undefined,
        },
      });
      push("Purchase recorded — stock updated");
      setShowNew(false); setLines([]);
      setForm({ supplierId: "", discount: "0", paidAmount: "0", walletId: "", dueDate: "", notes: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api(`/api/v1/purchases/${cancelTarget.id}/cancel`, { method: "POST", body: { reason } });
      push("Purchase cancelled");
      setCancelTarget(null); setReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!purchases) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Purchases</h1>
        {hasPerm("purchase.create") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New purchase</Button>
        )}
      </div>

      {purchases.length === 0 ? (
        <Card><Empty message="No purchases yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Supplier", "Items", "Total", "Paid", "Status", ""]} rightAlign={[4, 5]}>
          {purchases.map((p) => (
            <tr key={p.id} className={p.status === "CANCELLED" ? "opacity-50" : ""}>
              <td className="px-3 py-2 text-xs">{p.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(p.createdAt)}</td>
              <td className="px-3 py-2">{p.supplierName ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{p.lines.map((l) => `${l.item.name}×${l.quantity}`).join(", ")}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(p.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(p.paidAmount)}</td>
              <td className="px-3 py-2"><Badge status={p.status === "CANCELLED" ? "CANCELLED" : p.paymentStatus} /></td>
              <td className="px-3 py-2">
                {p.status === "COMPLETED" && hasPerm("purchase.cancel") && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelTarget(p)}>Cancel</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New purchase" wide>
        <div className="space-y-3">
          <Select label="Supplier" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">— (required if not fully paid)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {/* A shop recording its first purchase has no supplier yet, and the select was an
              empty dead end with no hint of where one comes from. The link opens the add
              form on arrival rather than dropping them on a list to work it out. */}
          {suppliers.length === 0 && (
            <p className="-mt-2 text-xs text-amber-700 dark:text-amber-400">
              No suppliers yet.{" "}
              <Link href="/suppliers?new=1" className="font-semibold underline">
                Add one first
              </Link>{" "}
              — you need one unless the purchase is paid in full.
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">Lines</span>
              <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { itemId: "", quantity: 1, unitPrice: "" }])}>
                <Plus size={14} className="mr-1 inline" />Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={l.itemId}
                    onChange={(e) => {
                      const it = items.find((x) => x.id === e.target.value);
                      setLines(lines.map((x, j) => j === i ? {
                        ...x, itemId: e.target.value,
                        unitPrice: it ? (Number(BigInt(it.costPrice)) / 100).toString() : x.unitPrice,
                      } : x));
                    }}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                  >
                    <option value="">Select item…</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                  </select>
                  <input
                    type="number" min={1} value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                  <input
                    placeholder="Unit cost" value={l.unitPrice} inputMode="decimal"
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))}
                    className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                  <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Discount" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} inputMode="decimal" />
            <Input label="Paid now" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} inputMode="decimal" />
            <Input label="Due date (unpaid part)" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          {paid > 0 && (
            <Select label="Pay from wallet" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
              <option value="">Select…</option>
              {wallets.filter((w) => w.currency === "MMK").map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
              ))}
            </Select>
          )}

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
            Subtotal <b className="tabular-nums">{subtotal.toLocaleString()}</b> · Total <b className="tabular-nums">{total.toLocaleString()}</b> MMK
            {unpaid > 0 && <span className="text-amber-600"> · {unpaid.toLocaleString()} unpaid → creates a payable</span>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={create}
              disabled={busy || lines.length === 0 || lines.some((l) => !l.itemId || !l.unitPrice) || (paid > 0 && !form.walletId) || (unpaid > 0 && !form.supplierId)}
            >
              {busy ? "Saving…" : "Confirm purchase"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title={`Cancel ${cancelTarget?.txnNo}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Stock and wallet payment are reversed. Logged in the audit trail.</p>
          <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Close</Button>
            <Button variant="danger" onClick={cancel} disabled={busy || reason.trim().length < 3}>Cancel purchase</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Badge, Table, Empty, cn, useToast } from "@/components/ui";
import { Paginated } from "@/components/Pager";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { duplicateImei, splitImeis } from "@/lib/imeiInput";
import { PageHeader } from "@/components/PageHeader";

/** On this device, purchases go into expense without asking. */
const PURCHASE_EXPENSE_KEY = "mahar.purchaseExpense";

interface Purchase {
  id: string; txnNo: string; date: string; total: string; paidAmount: string;
  paymentStatus: string; status: string; supplierName?: string; createdAt: string;
  lines: { id: string; quantity: number; unitCost: string; item: { name: string } }[];
}
interface Item { id: string; name: string; sku: string; barcode?: string | null; costPrice: string; trackSerial?: boolean }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Contact { id: string; name: string; type: string }
/** imeiText: for an IMEI-tracked phone, the IMEIs as typed or scanned; the quantity follows it. */
/** foc: given free by the supplier with the order — stock comes in at no cost. */
/** expiresAt: the best-before printed on this delivery (a mini mart); it becomes the item's. */
interface Line { itemId: string; quantity: number; unitPrice: string; imeiText?: string; foc?: boolean; paidPrice?: string; expiresAt?: string }
type PayMode = "full" | "none" | "part";

const blankForm = { supplierId: "", discount: "", partPaid: "", walletId: "", dueDate: "" };
const num = (v: string) => parseFloat(v.replace(/,/g, "")) || 0;

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
  const { hasPerm, defaultBranchId, phoneShop } = useAuth();

  const [lines, setLines] = useState<Line[]>([]);
  const [form, setForm] = useState(blankForm);
  const [payMode, setPayMode] = useState<PayMode>("full");
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    api<{ purchases: Purchase[] }>("/api/v1/purchases?pageSize=1000")
      .then((d) => setPurchases(d.purchases))
      .catch((e) => push(e.message, "error"));
    api<{ items: Item[] }>("/api/v1/items?pageSize=1000&active=1").then((d) => setItems(d.items)).catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
    api<{ contacts: Contact[] }>("/api/v1/customers?type=SUPPLIER&pageSize=200")
      .then((d) => setSuppliers(d.contacts)).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  const mmkWallets = wallets.filter((w) => w.currency === "MMK");
  // The first cash wallet is picked until the user chooses another, also when the form opens from ?new=1.
  const walletId = form.walletId || mmkWallets[0]?.id || "";
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q) || (it.barcode ?? "").toLowerCase() === q)
      .slice(0, 8);
  }, [items, query]);

  const subtotal = lines.reduce((a, l) => a + l.quantity * num(l.unitPrice), 0);
  const total = Math.max(0, subtotal - num(form.discount));
  const paid = payMode === "full" ? total : payMode === "none" ? 0 : Math.min(num(form.partPaid), total);
  const unpaid = total - paid;

  function openNew() {
    setLines([]); setForm(blankForm); setPayMode("full"); setQuery("");
    setShowNew(true);
  }

  /** Picking an item already on the list adds one more instead of a second row. */
  function addItem(it: Item) {
    setLines((prev) => prev.some((l) => l.itemId === it.id)
      // A tracked phone is counted from its IMEIs, so picking it again just keeps its row.
      ? prev.map((l) => l.itemId === it.id && !it.trackSerial ? { ...l, quantity: l.quantity + 1 } : l)
      : [...prev, {
          itemId: it.id, quantity: it.trackSerial ? 0 : 1,
          unitPrice: (Number(BigInt(it.costPrice)) / 100).toString(),
          ...(it.trackSerial ? { imeiText: "" } : {}),
        }]);
    setQuery("");
  }

  function setImeis(i: number, text: string) {
    setLine(i, { imeiText: text, quantity: splitImeis(text).length });
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => j === i ? { ...l, ...patch } : l));
  }

  const imeiProblem = lines.map((l) => {
    if (l.imeiText === undefined) return "";
    const list = splitImeis(l.imeiText);
    if (list.length === 0) return `Enter the IMEIs of ${itemById.get(l.itemId)?.name ?? "the phones"}`;
    const dup = duplicateImei(list);
    return dup ? `IMEI ${dup} is entered twice` : "";
  }).find(Boolean);
  const problem =
    lines.length === 0 ? "Add at least one item"
    : imeiProblem ? imeiProblem
    : lines.some((l) => !l.foc && !num(l.unitPrice)) ? "Enter a cost for every item, or tick FOC"
    : paid > 0 && !walletId ? "Choose the wallet you paid from"
    : unpaid > 0 && !form.supplierId ? "Choose a supplier for the unpaid amount"
    : "";

  // Purchases whose full item list is opened in the table.
  const [openLines, setOpenLines] = useState<Set<string>>(new Set());
  // After a purchase: ask whether its cost goes into expense. "always" skips the question.
  const [expenseAsk, setExpenseAsk] = useState<{ id: string; txnNo: string; total: string } | null>(null);
  const [expenseAlways, setExpenseAlways] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(PURCHASE_EXPENSE_KEY) === "always"; } catch { return false; }
  });
  const [rememberExpense, setRememberExpense] = useState(false);

  async function addPurchaseExpense(ask: { id: string; total: string }, auto = false) {
    try {
      await api(`/api/v1/purchases/${ask.id}/expense`, { method: "POST" });
      push(`${fmtMoney(ask.total)} added to expense${auto ? " (auto)" : ""}`);
      if (rememberExpense) {
        try { localStorage.setItem(PURCHASE_EXPENSE_KEY, "always"); } catch { /* private mode */ }
        setExpenseAlways(true);
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not add to expense", "error");
    } finally {
      setExpenseAsk(null);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const saved = await api<{ id: string; txnNo: string; total: string }>("/api/v1/purchases", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          supplierId: form.supplierId || undefined,
          lines: lines.map((l) => ({
            itemId: l.itemId, quantity: l.quantity, unitPrice: l.foc ? "0" : l.unitPrice,
            ...(l.imeiText === undefined ? {} : { imeis: splitImeis(l.imeiText) }),
            ...(l.expiresAt ? { expiresAt: l.expiresAt } : {}),
          })),
          discount: String(num(form.discount)),
          paidAmount: String(paid),
          walletId: paid > 0 ? walletId : undefined,
          dueDate: unpaid > 0 && form.dueDate ? form.dueDate : undefined,
        },
      });
      push("Purchase recorded — stock updated");
      if (BigInt(saved.total) > 0n) {
        const ask = { id: saved.id, txnNo: saved.txnNo, total: saved.total };
        if (expenseAlways) addPurchaseExpense(ask, true);
        else { setRememberExpense(false); setExpenseAsk(ask); }
      }
      setShowNew(false);
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
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader title={<>Purchases</>}>
        {hasPerm("purchase.create") && (
          <Button onClick={openNew}><Plus size={16} className="mr-1 inline" />New purchase</Button>
        )}
      </PageHeader>

      {purchases.length === 0 ? (
        <Card><Empty message="No purchases yet" /></Card>
      ) : (
        <Paginated rows={purchases} resetKey={""}>{(pageRows) => (
        <Table headers={["Txn", "Date", "Supplier", "Items", "Total", "Paid", "Status", ""]} rightAlign={[4, 5]}>
          {pageRows.map((p) => (
            <tr key={p.id} className={p.status === "CANCELLED" ? "opacity-50" : ""}>
              <td className="px-3 py-2 text-xs">{p.txnNo}</td>
              <td className="px-3 py-2 text-xs">{fmtDateTime(p.createdAt)}</td>
              <td className="px-3 py-2">{p.supplierName ?? "—"}</td>
              <td className="max-w-md px-3 py-2 text-xs">
                {(() => {
                  const names = p.lines.map((l) => `${l.item.name}×${l.quantity}${BigInt(l.unitCost) === 0n ? " (FOC)" : ""}`);
                  const open = openLines.has(p.id);
                  const shown = open ? names : names.slice(0, 2);
                  return (
                    <>
                      <span className={open ? "" : "line-clamp-2"}>{shown.join(", ")}</span>
                      {names.length > 2 && (
                        <button type="button" className="ml-1 font-medium text-blue-600"
                          onClick={() => setOpenLines((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                          {open ? "less" : `+${names.length - 2} more`}
                        </button>
                      )}
                    </>
                  );
                })()}
              </td>
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
        )}</Paginated>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New purchase" wide>
        <div className="space-y-4">
          <div>
            <Select label="Supplier" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">No supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {suppliers.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                No suppliers yet.{" "}
                <Link href="/suppliers?new=1" className="font-semibold text-blue-600 underline">Add one</Link>
              </p>
            )}
          </div>

          {/* Type or scan to find an item; picking it puts it on the list straight away. */}
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); addItem(matches[0]); } }}
              placeholder="Search or scan an item to add"
              className="min-h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            {query.trim() && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {matches.length === 0 ? (
                  <div className="px-3 py-2.5 text-sm text-gray-500">No items found</div>
                ) : matches.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => addItem(it)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-gray-800"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{it.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{it.sku}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-gray-500">{fmtMoney(it.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-400 dark:border-gray-700">
              Items you add appear here
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {lines.map((l, i) => {
                const it = itemById.get(l.itemId);
                return (
                  <div key={l.itemId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="truncate text-sm font-medium">{it?.name ?? "—"}</div>
                      <div className="text-xs tabular-nums text-gray-500">{(l.quantity * num(l.unitPrice)).toLocaleString()} MMK</div>
                    </div>
                    {l.imeiText !== undefined ? (
                      <span className="rounded-lg bg-blue-50 px-2.5 py-2 text-sm font-medium tabular-nums text-blue-700 dark:bg-blue-950 dark:text-blue-300">{l.quantity} phone{l.quantity === 1 ? "" : "s"}</span>
                    ) : (
                    <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-700">
                      <button type="button" className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30" disabled={l.quantity <= 1} onClick={() => setLine(i, { quantity: l.quantity - 1 })} aria-label="Less">
                        <Minus size={14} />
                      </button>
                      <input
                        value={l.quantity}
                        inputMode="numeric"
                        onChange={(e) => setLine(i, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-12 bg-transparent text-center text-sm tabular-nums outline-none"
                        aria-label="Qty"
                      />
                      <button type="button" className="p-2 text-gray-500 hover:text-gray-900" onClick={() => setLine(i, { quantity: l.quantity + 1 })} aria-label="More">
                        <Plus size={14} />
                      </button>
                    </div>
                    )}
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      value={l.unitPrice}
                      disabled={l.foc}
                      inputMode="decimal"
                      onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                      placeholder="Unit cost"
                      title="Unit cost"
                      className="w-28 rounded-lg border border-gray-300 bg-white px-2 py-2 text-right text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:disabled:bg-gray-900"
                    />
                    {/* Free with the order: the stock comes in, nothing is paid for it. */}
                    <label className={cn("flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold", l.foc ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "border-gray-300 text-gray-500 dark:border-gray-700")}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={Boolean(l.foc)}
                        onChange={(e) => setLine(i, e.target.checked ? { foc: true, paidPrice: l.unitPrice, unitPrice: "0" } : { foc: false, unitPrice: l.paidPrice || l.unitPrice })}
                      />
                      FOC
                    </label>
                    {!phoneShop && (
                      <input
                        type="date"
                        value={l.expiresAt ?? ""}
                        onChange={(e) => setLine(i, { expiresAt: e.target.value })}
                        title="Expiry date (optional)"
                        aria-label="Expiry date"
                        className="w-36 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                    )}
                    <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500" aria-label="Remove">
                      <Trash2 size={15} />
                    </button>
                    {l.imeiText !== undefined && (
                      <textarea
                        value={l.imeiText}
                        onChange={(e) => setImeis(i, e.target.value)}
                        rows={Math.min(6, Math.max(2, l.quantity + 1))}
                        placeholder="Scan or type IMEIs, one per line"
                        className="w-full basis-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="tabular-nums">{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-500">Discount</span>
              <input
                value={form.discount}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                className="w-28 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2 dark:border-gray-700">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold tabular-nums">{total.toLocaleString()} MMK</span>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200 p-1 text-sm dark:bg-gray-900">
              {([["full", "Paid in full"], ["part", "Part paid"], ["none", "Pay later"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPayMode(mode)}
                  className={cn("rounded-md px-2 py-2 font-medium", payMode === mode ? "bg-white shadow dark:bg-gray-700" : "text-gray-600 dark:text-gray-400")}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {payMode === "part" && (
                <Input label="Paid now" value={form.partPaid} inputMode="decimal" placeholder="0" onChange={(e) => setForm({ ...form, partPaid: e.target.value })} />
              )}
              {paid > 0 && (
                <Select label="Pay from wallet" value={walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
                  <option value="">Select…</option>
                  {mmkWallets.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                  ))}
                </Select>
              )}
              {unpaid > 0 && (
                <Input label="Due date (unpaid part)" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              )}
            </div>
            {unpaid > 0 && (
              <div className="flex items-center justify-between gap-3 text-sm text-amber-700 dark:text-amber-400">
                <span>Owed to supplier</span>
                <span className="font-semibold tabular-nums">{unpaid.toLocaleString()} MMK</span>
              </div>
            )}
          </div>

          {expenseAlways && (
            <p className="text-xs text-gray-500">The purchase is added to expense automatically. <button type="button" className="text-blue-600" onClick={() => { try { localStorage.removeItem(PURCHASE_EXPENSE_KEY); } catch { /* private mode */ } setExpenseAlways(false); }}>Ask me instead</button></p>
          )}
          <div className="flex items-center justify-end gap-2">
            {problem && <span className="mr-auto text-xs text-gray-500">{problem}</span>}
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || Boolean(problem)}>
              {busy ? "Saving…" : "Confirm purchase"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(expenseAsk)} onClose={() => setExpenseAsk(null)} title="Add to expense?">
        {expenseAsk && (
          <div className="space-y-3">
            <p className="text-sm">{`Add ${fmtMoney(expenseAsk.total)} for purchase ${expenseAsk.txnNo} to expense as Daily Sale Expense?`}</p>
            <p className="text-xs text-gray-500">The purchase already paid (or owes) the supplier; this only records it as an expense, so money is not taken out twice. Reports then count sales cost from what you bought.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rememberExpense} onChange={(e) => setRememberExpense(e.target.checked)} />
              Always add, don&apos;t ask again
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setExpenseAsk(null)}>No</Button>
              <Button onClick={() => addPurchaseExpense(expenseAsk)}>Yes, add to expense</Button>
            </div>
          </div>
        )}
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

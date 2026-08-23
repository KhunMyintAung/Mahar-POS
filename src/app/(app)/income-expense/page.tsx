"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Item {
  id: string; txnNo: string; type: string; categoryName?: string; amount: string;
  currency: string; date: string; description?: string; status: string;
}
interface Category { id: string; type: string; name: string }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

export default function IncomeExpensePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [totals, setTotals] = useState({ income: "0", expense: "0" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [showCategories, setShowCategories] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [busy, setBusy] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const [form, setForm] = useState({ type: "EXPENSE", categoryName: "", amount: "", walletId: "", date: "", description: "", reference: "" });

  const load = useCallback(() => {
    api<{ items: Item[]; totals: { income: string; expense: string } }>("/api/v1/income-expense?pageSize=100")
      .then((d) => { setItems(d.items); setTotals(d.totals); })
      .catch((e) => push(e.message, "error"));
    api<Category[]>("/api/v1/categories").then(setCategories).catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      let categoryName = form.categoryName;
      if (newCategory) {
        const category = await api<Category>("/api/v1/categories", {
          method: "POST",
          body: { type: form.type, name: newCategoryName.trim() },
        });
        categoryName = category.name;
      }
      await api("/api/v1/income-expense", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          type: form.type,
          categoryName,
          amount: form.amount,
          walletId: form.walletId,
          date: form.date || undefined,
          description: form.description || undefined,
          reference: form.reference || undefined,
        },
      });
      push(`${form.type === "INCOME" ? "Income" : "Expense"} recorded`);
      setShowNew(false);
      setNewCategory(false);
      setNewCategoryName("");
      setForm({ ...form, amount: "", description: "", reference: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reverse() {
    if (!reverseId) return;
    setBusy(true);
    try {
      await api(`/api/v1/income-expense/${reverseId}/reverse`, { method: "POST", body: { reason: reverseReason } });
      push("Entry voided");
      setReverseId(null);
      setReverseReason("");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Void failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: Category) {
    setBusy(true);
    try {
      const result = await api<{ removed: boolean; keptForRecords: number }>(
        `/api/v1/categories?id=${encodeURIComponent(category.id)}`,
        { method: "DELETE" }
      );
      push(
        result.removed
          ? `"${category.name}" removed`
          : `"${category.name}" hidden — ${result.keptForRecords} record(s) still use it`
      );
      // Re-read rather than filtering locally: a used category is deactivated, not gone,
      // and the list must show what the server actually did.
      const fresh = await api<Category[]>("/api/v1/categories");
      setCategories(fresh);
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not remove", "error");
    } finally {
      setBusy(false);
      setConfirmRemove(null);
    }
  }

  if (!items) return <Spinner />;
  const catOptions = categories.filter((c) => c.type === form.type);
  const canSave =
    !!form.amount &&
    !!form.walletId &&
    (newCategory ? newCategoryName.trim().length > 0 : !!form.categoryName);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Income & Expense</h1>
        {hasPerm("income_expense.create") && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCategories(true)}>Categories</Button>
            <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New entry</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total income" value={fmtMoney(totals.income, "MMK")} tone="green" />
        <StatCard label="Total expense" value={fmtMoney(totals.expense, "MMK")} tone="red" />
      </div>

      {items.length === 0 ? (
        <Card><Empty message="No entries yet" /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Type", "Category", "Description", "Amount", ""]} rightAlign={[5]}>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2 text-xs">{it.txnNo}</td>
              <td className="px-3 py-2 text-xs">{it.date}</td>
              <td className="px-3 py-2">
                <span className={`text-xs font-bold ${it.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>{it.type}</span>
              </td>
              <td className="px-3 py-2">{it.categoryName ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{it.description ?? "—"}</td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${it.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                {it.type === "INCOME" ? "+" : "-"}{fmtMoney(it.amount)} {it.currency}
              </td>
              <td className="px-3 py-2">
                {it.status === "COMPLETED" && hasPerm("wallet.reverse") && (
                  <Button size="sm" variant="ghost" onClick={() => setReverseId(it.id)}>Void</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showCategories} onClose={() => setShowCategories(false)} title="Categories">
        <div className="space-y-4">
          {(["INCOME", "EXPENSE"] as const).map((type) => {
            const list = categories.filter((c) => c.type === type);
            return (
              <div key={type}>
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  {type === "INCOME" ? "Income" : "Expense"}
                </h4>
                {list.length === 0 ? (
                  <p className="text-sm text-gray-500">None yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                    {list.map((category) => (
                      <div key={category.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm">{category.name}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirmRemove(category)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-gray-500">
            Past entries keep the category they were filed under, whatever happens here.
          </p>
        </div>
      </Modal>

      <Modal open={Boolean(confirmRemove)} onClose={() => setConfirmRemove(null)} title="Remove category">
        {confirmRemove && (
          <div className="space-y-3">
            <p className="text-sm">
              Remove <b>{confirmRemove.name}</b>? It will stop appearing when you record income
              or expense. Entries already filed under it are not changed.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmRemove(null)}>Cancel</Button>
              <Button variant="danger" disabled={busy} onClick={() => removeCategory(confirmRemove)}>
                {busy ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New income / expense">
        <div className="space-y-3">
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => {
              setForm({ ...form, type: e.target.value, categoryName: "" });
              setNewCategory(false);
              setNewCategoryName("");
            }}
          >
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            {newCategory ? (
              <Input
                label="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                autoFocus
              />
            ) : (
            <Select
              label="Category"
              value={form.categoryName}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setNewCategory(true);
                  setForm({ ...form, categoryName: "" });
                } else {
                  setForm({ ...form, categoryName: e.target.value });
                }
              }}
            >
              <option value="">Select…</option>
              {catOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value="__new__">+ Add new category</option>
            </Select>
            )}
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          {newCategory && (
            <button
              type="button"
              className="text-left text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => {
                setNewCategory(false);
                setNewCategoryName("");
              }}
            >
              Choose an existing category
            </button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
            <Select label="Wallet" value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
              <option value="">Select…</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)} {w.currency})</option>)}
            </Select>
          </div>
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !canSave}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!reverseId} onClose={() => setReverseId(null)} title="Void entry">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">The wallet movement will be reversed. This action is logged.</p>
          <Input label="Reason (required)" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReverseId(null)}>Cancel</Button>
            <Button variant="danger" onClick={reverse} disabled={busy || reverseReason.trim().length < 3}>Void</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

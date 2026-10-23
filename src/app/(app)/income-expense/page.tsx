"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { PageHeader } from "@/components/PageHeader";

interface Item {
  id: string; txnNo: string; type: string; categoryName?: string; amount: string;
  currency: string; date: string; description?: string; status: string;
}
/** systemKey marks one of the eight standard daily categories: renamed, never deleted. */
interface Category { id: string; type: string; name: string; systemKey?: string | null }
interface Wallet { id: string; name: string; currency: string; currentBalance: string }

const todayDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
const shiftDay = (d: string, by: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + by);
  return x.toISOString().slice(0, 10);
};

export default function IncomeExpensePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [totals, setTotals] = useState({ income: "0", expense: "0", withdraw: "0" });
  // The day shown, or every day when "All dates" is picked.
  const [day, setDay] = useState(todayDate);
  const [allDates, setAllDates] = useState(false);
  // Tapping a card lists only that kind; tapping it again lists everything.
  const [typeFilter, setTypeFilter] = useState<"" | "INCOME" | "EXPENSE" | "WITHDRAW">("");
  const pickType = (t: "INCOME" | "EXPENSE" | "WITHDRAW") => setTypeFilter((cur) => (cur === t ? "" : t));
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showNew, setShowNew] = useNewModal();
  const [showCategories, setShowCategories] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  // Categories window: the one being renamed, and the name being typed for each new one.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({ INCOME: "", EXPENSE: "" });
  const [busy, setBusy] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const { push } = useToast();
  const { hasPerm, defaultBranchId } = useAuth();

  const [form, setForm] = useState({ type: "EXPENSE", categoryName: "", amount: "", walletId: "", date: "", description: "", reference: "" });

  const load = useCallback(() => {
    api<{ items: Item[]; totals: { income: string; expense: string; withdraw: string } }>(`/api/v1/income-expense?pageSize=100${allDates ? "" : `&date=${day}`}`)
      .then((d) => { setItems(d.items); setTotals(d.totals); })
      .catch((e) => push(e.message, "error"));
    api<Category[]>("/api/v1/categories").then(setCategories).catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then(setWallets).catch(() => {});
  }, [push, day, allDates]);
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

  async function refreshCategories() {
    setCategories(await api<Category[]>("/api/v1/categories"));
  }

  async function renameCategory() {
    if (!renaming?.name.trim()) return;
    setBusy(true);
    try {
      await api("/api/v1/categories", { method: "PATCH", body: { id: renaming.id, name: renaming.name.trim() } });
      push("Renamed");
      setRenaming(null);
      await refreshCategories();
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(type: "INCOME" | "EXPENSE") {
    const name = adding[type].trim();
    if (!name) return;
    setBusy(true);
    try {
      await api("/api/v1/categories", { method: "POST", body: { type, name } });
      push(`"${name}" added`);
      setAdding((a) => ({ ...a, [type]: "" }));
      await refreshCategories();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
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

  const shownItems = typeFilter ? items.filter((it) => it.type === typeFilter) : items;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={<>Income & Expense</>}>
        {hasPerm("income_expense.create") && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCategories(true)}>Categories</Button>
            <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New entry</Button>
          </div>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          <button type="button" onClick={() => setAllDates(false)} className={`rounded-md px-3 py-1.5 text-sm ${!allDates ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>Day</button>
          <button type="button" onClick={() => setAllDates(true)} className={`rounded-md px-3 py-1.5 text-sm ${allDates ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>All dates</button>
        </div>
        {!allDates && (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={18} /></button>
            <input type="date" value={day} max={todayDate()} onChange={(e) => e.target.value && setDay(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
            <button type="button" aria-label="Next day" disabled={day >= todayDate()} onClick={() => setDay(shiftDay(day, 1))} className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"><ChevronRight size={18} /></button>
            {day !== todayDate() && <button type="button" onClick={() => setDay(todayDate())} className="ml-1 text-sm text-blue-600">Today</button>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={typeFilter === "INCOME" ? "rounded-lg ring-2 ring-green-500" : ""}>
          <StatCard label={allDates ? "Total income" : day === todayDate() ? "Today's income" : "Income"} value={fmtMoney(totals.income, "MMK")} tone="green" onClick={() => pickType("INCOME")} sub={typeFilter === "INCOME" ? "Showing income only" : "Tap to list income"} />
        </div>
        <div className={typeFilter === "EXPENSE" ? "rounded-lg ring-2 ring-red-500" : ""}>
          <StatCard label={allDates ? "Total expense" : day === todayDate() ? "Today's expense" : "Expense"} value={fmtMoney(totals.expense, "MMK")} tone="red" onClick={() => pickType("EXPENSE")} sub={typeFilter === "EXPENSE" ? "Showing expense only" : "Tap to list expense"} />
        </div>
        <StatCard label="Income − expense" value={fmtMoney((BigInt(totals.income) - BigInt(totals.expense)).toString(), "MMK")} tone={BigInt(totals.income) >= BigInt(totals.expense) ? "blue" : "red"} onClick={() => setTypeFilter("")} sub={typeFilter ? "Tap to show all" : undefined} />
        <div className={typeFilter === "WITHDRAW" ? "rounded-lg ring-2 ring-amber-500" : ""}>
          <StatCard label="Withdrawals" value={fmtMoney(totals.withdraw ?? "0", "MMK")} tone="amber" onClick={() => pickType("WITHDRAW")} />
        </div>
      </div>

      {typeFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-300">Showing {typeFilter === "INCOME" ? "income" : typeFilter === "EXPENSE" ? "expense" : "withdrawals"} only</span>
          <button type="button" className="text-blue-600" onClick={() => setTypeFilter("")}>Show all</button>
        </div>
      )}

      {shownItems.length === 0 ? (
        <Card><Empty message={allDates ? "No entries yet" : "No entries on this day"} /></Card>
      ) : (
        <Table headers={["Txn", "Date", "Type", "Category", "Description", "Amount", ""]} rightAlign={[5]}>
          {shownItems.map((it) => (
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
                      <div key={category.id} className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
                        {renaming?.id === category.id ? (
                          <>
                            <input
                              autoFocus
                              value={renaming.name}
                              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") renameCategory(); if (e.key === "Escape") setRenaming(null); }}
                              className="min-h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                            />
                            <Button size="sm" disabled={busy || !renaming.name.trim()} onClick={renameCategory}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <span className="flex min-w-0 items-center gap-1.5 text-sm">
                              {category.systemKey && <Lock size={13} className="shrink-0 text-gray-400" aria-label="Standard category" />}
                              <span className="truncate">{category.name}</span>
                            </span>
                            <span className="flex shrink-0 gap-1">
                              <Button variant="ghost" size="sm" disabled={busy} aria-label={`Rename ${category.name}`} onClick={() => setRenaming({ id: category.id, name: category.name })}>
                                <Pencil size={15} />
                              </Button>
                              {!category.systemKey && (
                                <Button variant="secondary" size="sm" disabled={busy} aria-label={`Delete ${category.name}`} onClick={() => setConfirmRemove(category)}>
                                  <Trash2 size={15} />
                                </Button>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    value={adding[type]}
                    onChange={(e) => setAdding((a) => ({ ...a, [type]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addCategory(type); }}
                    placeholder={type === "INCOME" ? "New income category" : "New expense category"}
                    className="min-h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                  <Button size="sm" variant="secondary" disabled={busy || !adding[type].trim()} onClick={() => addCategory(type)}>
                    <Plus size={14} className="mr-1 inline" />Add
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-500">
            🔒 The eight standard daily categories can be renamed but not deleted. Renaming moves past entries to the new name. A deleted category&apos;s past entries keep its name.
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

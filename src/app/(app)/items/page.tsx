"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { BarcodeInput } from "@/components/BarcodeScanner";
import { ProductImport } from "@/components/ProductImport";
import { repriced, validRule, type RepriceDirection, type RepriceMode, type RepriceRule } from "@/lib/reprice";

interface Item {
  id: string; name: string; sku: string; barcode?: string; active: boolean;
  costPrice: string; sellingPrice: string; minStock: number;
  category?: { name: string }; unit?: { name: string };
  stockLevels: { branchId: string; quantity: number }[];
}
interface Meta { categories: { id: string; name: string }[]; units: { id: string; name: string }[] }

export default function ItemsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [meta, setMeta] = useState<Meta>({ categories: [], units: [] });
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"reprice" | "delete" | null>(null);
  const [rule, setRule] = useState<{ mode: RepriceMode; value: string; direction: RepriceDirection; roundTo: string }>(
    { mode: "percent", value: "", direction: "down", roundTo: "100" }
  );
  const { push } = useToast();
  const { hasPerm } = useAuth();

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulk() {
    if (!bulk) return;
    setBusy(true);
    try {
      const ids = [...selected];
      if (bulk === "delete") {
        const r = await api<{ deleted: number }>("/api/v1/items/bulk", { method: "POST", body: { action: "delete", ids } });
        push(`${r.deleted} item(s) deleted`);
      } else {
        const r = await api<{ updated: number }>("/api/v1/items/bulk", {
          method: "POST",
          body: { action: "reprice", ids, rule: parsedRule },
        });
        push(`${r.updated} price(s) changed`);
      }
      setBulk(null);
      setSelected(new Set());
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const parsedRule: RepriceRule = {
    mode: rule.mode,
    value: Number(rule.value),
    direction: rule.direction,
    roundTo: Number(rule.roundTo) || 0,
  };
  const ruleProblem = rule.value.trim() === "" ? "Enter a number" : validRule(parsedRule);

  const empty = { name: "", sku: "", barcode: "", categoryId: "", unitId: "", costPrice: "0", sellingPrice: "0", minStock: 0 };
  const [form, setForm] = useState(empty);
  const [metaForm, setMetaForm] = useState({ kind: "category", name: "" });

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "200" });
    if (q) params.set("q", q);
    api<{ items: Item[] }>(`/api/v1/items?${params}`)
      .then((d) => {
        setItems(d.items);
        // A bulk action only ever touches what is on screen.
        const shown = new Set(d.items.map((it) => it.id));
        setSelected((current) => new Set([...current].filter((id) => shown.has(id))));
      })
      .catch((e) => push(e.message, "error"));
    api<Meta>("/api/v1/item-meta").then(setMeta).catch(() => {});
  }, [q, push]);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function save() {
    setBusy(true);
    try {
      if (editItem) {
        await api(`/api/v1/items/${editItem.id}`, {
          method: "PATCH",
          body: {
            name: form.name, barcode: form.barcode || undefined,
            categoryId: form.categoryId || null, unitId: form.unitId || null,
            costPrice: form.costPrice, sellingPrice: form.sellingPrice, minStock: form.minStock,
          },
        });
        push("Item updated");
      } else {
        await api("/api/v1/items", {
          method: "POST",
          body: {
            ...form,
            barcode: form.barcode || undefined,
            categoryId: form.categoryId || undefined,
            unitId: form.unitId || undefined,
          },
        });
        push("Item created");
      }
      setShowNew(false); setEditItem(null); setForm(empty);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addMeta() {
    try {
      await api("/api/v1/item-meta", { method: "POST", body: metaForm });
      push(`${metaForm.kind === "category" ? "Category" : "Unit"} added`);
      setMetaForm({ ...metaForm, name: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!items) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Items</h1>
        <div className="flex flex-wrap gap-2">
          {hasPerm("item.manage") && (
            <>
              <Button variant="secondary" onClick={() => setShowMeta(true)}>Categories & Units</Button>
              <ProductImport onDone={load} />
              <Button onClick={() => { setForm(empty); setEditItem(null); setShowNew(true); }}>
                <Plus size={16} className="mr-1 inline" />New item
              </Button>
            </>
          )}
        </div>
      </div>

      <Input placeholder="Search name, SKU, or barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />

      {hasPerm("item.manage") && items.length > 0 && (
        <div className={cn(
          "sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          selected.size > 0
            ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30"
            : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
        )}>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.size > 0 && items.every((it) => selected.has(it.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map((it) => it.id)) : new Set())}
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setBulk("reprice")}>Reprice</Button>
              <Button size="sm" variant="danger" onClick={() => setBulk("delete")}>Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <Card><Empty message="No items found" /></Card>
      ) : (
        <Table headers={["", "Item", "SKU", "Category", "Unit", "Cost", "Price", "Stock", ""]} rightAlign={[5, 6, 7]}>
          {items.map((it) => {
            const qty = it.stockLevels.reduce((a, l) => a + l.quantity, 0);
            return (
              <tr key={it.id} className={cn(!it.active && "opacity-50", selected.has(it.id) && "bg-blue-50 dark:bg-blue-900/20")}>
                <td className="w-8 px-3 py-2.5">
                  {hasPerm("item.manage") && (
                    <input type="checkbox" className="h-4 w-4" aria-label={`Select ${it.name}`} checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  )}
                </td>
                <td className="px-3 py-2.5 font-medium">{it.name}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{it.sku}</td>
                <td className="px-3 py-2.5 text-xs">{it.category?.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs">{it.unit?.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(it.costPrice)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtMoney(it.sellingPrice)}</td>
                <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", it.minStock > 0 && qty < it.minStock && "text-red-600")}>
                  {qty}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {hasPerm("item.manage") && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      setForm({
                        name: it.name, sku: it.sku, barcode: it.barcode ?? "",
                        categoryId: "", unitId: "",
                        costPrice: (Number(BigInt(it.costPrice)) / 100).toString(),
                        sellingPrice: (Number(BigInt(it.sellingPrice)) / 100).toString(),
                        minStock: it.minStock,
                      });
                      setEditItem(it);
                      setShowNew(true);
                    }}>Edit</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <Modal open={showNew} onClose={() => { setShowNew(false); setEditItem(null); }} title={editItem ? `Edit ${editItem.name}` : "New item"}>
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="SKU"
              value={form.sku}
              disabled={!!editItem}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder={editItem ? "" : "Left empty, one is made from the name"}
            />
            <BarcodeInput
              label="Barcode"
              value={form.barcode}
              onChange={(barcode) => setForm({ ...form, barcode })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">—</option>
              {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Unit" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
              <option value="">—</option>
              {meta.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Cost price" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} inputMode="decimal" />
            <Input label="Selling price" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} inputMode="decimal" />
            <Input label="Min stock" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowNew(false); setEditItem(null); }}>Cancel</Button>
            <Button onClick={save} disabled={busy || !form.name}>{editItem ? "Save changes" : "Create item"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulk === "delete"} onClose={() => setBulk(null)} title={`Delete ${selected.size} item(s)`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            These items will be removed from the item list and the POS. Past sales and purchases keep them. This is logged.
          </p>
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
            {items.filter((it) => selected.has(it.id)).map((it) => <li key={it.id}>{it.name}</li>)}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button>
            <Button variant="danger" onClick={runBulk} disabled={busy}>{busy ? "Deleting…" : `Delete ${selected.size}`}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulk === "reprice"} onClose={() => setBulk(null)} title={`Reprice ${selected.size} item(s)`} wide>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label="Change by" value={rule.mode} onChange={(e) => setRule({ ...rule, mode: e.target.value as RepriceMode })}>
              <option value="percent">By percent (%)</option>
              <option value="amount">By amount (MMK)</option>
              <option value="set">Set one price</option>
            </Select>
            {rule.mode !== "set" && (
              <Select label="Raise or lower" value={rule.direction} onChange={(e) => setRule({ ...rule, direction: e.target.value as RepriceDirection })}>
                <option value="down">Discount (lower)</option>
                <option value="up">Increase (raise)</option>
              </Select>
            )}
            <Input
              label={rule.mode === "percent" ? "Percent" : rule.mode === "amount" ? "Amount (MMK)" : "New price (MMK)"}
              value={rule.value}
              inputMode="decimal"
              onChange={(e) => setRule({ ...rule, value: e.target.value })}
              placeholder={rule.mode === "percent" ? "10" : "1000"}
            />
            <Select label="Round to" value={rule.roundTo} onChange={(e) => setRule({ ...rule, roundTo: e.target.value })}>
              <option value="0">No rounding</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1,000</option>
            </Select>
          </div>
          {ruleProblem ? (
            <p className="text-sm text-gray-500">{ruleProblem}</p>
          ) : (
            (() => {
              const rows = items.filter((it) => selected.has(it.id)).map((it) => {
                const next = repriced(BigInt(it.sellingPrice), parsedRule);
                return { it, next, belowCost: next < BigInt(it.costPrice) };
              });
              const below = rows.filter((r) => r.belowCost).length;
              return (
                <>
                  {below > 0 && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      {below} item(s) would sell below cost.
                    </p>
                  )}
                  <div className="max-h-64 overflow-y-auto">
                    <Table headers={["Item", "Cost", "Price now", "New price"]} rightAlign={[1, 2, 3]}>
                      {rows.map(({ it, next, belowCost }) => (
                        <tr key={it.id}>
                          <td className="px-3 py-1.5">{it.name}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtMoney(it.costPrice)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(it.sellingPrice)}</td>
                          <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", belowCost ? "text-red-600" : "text-blue-600")}>
                            {fmtMoney(next.toString())}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </>
              );
            })()
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button>
            <Button onClick={runBulk} disabled={busy || Boolean(ruleProblem)}>{busy ? "Saving…" : `Apply to ${selected.size}`}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showMeta} onClose={() => setShowMeta(false)} title="Categories & Units">
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <Select label="Type" value={metaForm.kind} onChange={(e) => setMetaForm({ ...metaForm, kind: e.target.value })}>
              <option value="category">Category</option>
              <option value="unit">Unit</option>
            </Select>
            <div className="flex-1"><Input label="Name" value={metaForm.name} onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })} /></div>
            <Button onClick={addMeta} disabled={!metaForm.name}>Add</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="mb-1 font-semibold">Categories</h4>
              <ul className="space-y-0.5">{meta.categories.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
            </div>
            <div>
              <h4 className="mb-1 font-semibold">Units</h4>
              <ul className="space-y-0.5">{meta.units.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

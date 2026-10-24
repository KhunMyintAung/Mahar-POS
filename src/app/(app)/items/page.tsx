"use client";

import { useCallback, useEffect, useState } from "react";
import { autoCorrectName } from "@/lib/autoCorrect";
import { Download, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, cn, useToast } from "@/components/ui";
import { isPhoneCategory } from "@/lib/itemCategoryPresets";
import { Paginated } from "@/components/Pager";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { BarcodeInput } from "@/components/BarcodeScanner";
import { ProductImport } from "@/components/ProductImport";
import { repriced, validRule, type RepriceDirection, type RepriceMode, type RepriceRule } from "@/lib/reprice";
import { PageHeader } from "@/components/PageHeader";
import { groupByModel, variantLabel, variantName } from "@/lib/variants";

interface Item {
  id: string; name: string; sku: string; barcode?: string; active: boolean;
  costPrice: string; sellingPrice: string; minStock: number; trackSerial?: boolean;
  categoryId?: string | null; unitId?: string | null;
  category?: { name: string }; unit?: { name: string };
  stockLevels: { branchId: string; quantity: number }[];
  /** Variants: the model this item belongs to, and what sets it apart. */
  model?: string | null; variant?: string | null;
}
interface Meta { categories: { id: string; name: string }[]; units: { id: string; name: string }[] }

export default function ItemsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [meta, setMeta] = useState<Meta>({ categories: [], units: [] });
  const [missingPresets, setMissingPresets] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("ALL");
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

  const empty = { name: "", sku: "", barcode: "", categoryId: "", unitId: "", costPrice: "0", sellingPrice: "0", minStock: 0, trackSerial: false, model: "", variant: "" };
  // The item a new variant is copied from, so it can be put under the same model too.
  const [variantOf, setVariantOf] = useState<Item | null>(null);
  const [form, setForm] = useState(empty);
  const [metaForm, setMetaForm] = useState({ kind: "category", name: "" });

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "1000" });
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
    api<{ missing: string[] }>("/api/v1/item-meta/presets").then((d) => setMissingPresets(d.missing)).catch(() => {});
  }, [q, push]);

  /** Add the ready-made categories for this kind of shop (a phone shop's: Phone New,
   *  Phone Second, Glass, Spare Parts…) that it does not have yet. */
  async function addPresets() {
    try {
      const r = await api<{ added: number }>("/api/v1/item-meta/presets", { method: "POST" });
      push(`${r.added} categories added`);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }
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
            trackSerial: form.trackSerial,
            model: form.model, variant: form.model ? form.variant : "",
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
            model: form.model || undefined,
            variant: form.model ? form.variant || undefined : undefined,
          },
        });
        // A variant made from an item that had no model yet: put that item under it too.
        if (variantOf && !variantOf.model && form.model) {
          await api(`/api/v1/items/${variantOf.id}`, { method: "PATCH", body: { model: form.model } });
        }
        push("Item created");
      }
      setShowNew(false); setEditItem(null); setVariantOf(null); setForm(empty);
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

  // Filtered by category the same way as Stock, so a whole shelf — all the glass, all the
  // spare parts — can be picked out and selected at once.
  const NONE = "—";
  const categoryOf = (it: Item) => it.category?.name ?? NONE;
  const categories = [...new Set(items.map(categoryOf))].sort((a, b) =>
    a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)
  );
  const shownItems = category === "ALL" ? items : items.filter((it) => categoryOf(it) === category);
  const stockOf = (it: Item) => it.stockLevels.reduce((a, l) => a + l.quantity, 0);
  const chosen = items.filter((it) => selected.has(it.id));
  const chosenWithStock = chosen.filter((it) => stockOf(it) > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader
        title={<>Items</>}
        lead={<input placeholder="Search name, SKU, or barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:text-sm sm:max-w-sm" />}
      >
        <div className="flex flex-wrap gap-1.5">
          {/* Exports the category being viewed, in the import's own columns. */}
          <a
            href={`/api/v1/items/export${category === "ALL" ? "" : `?category=${encodeURIComponent(category)}`}`}
            className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Download size={16} className="mr-1 inline" />Export CSV
          </a>
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
      </PageHeader>

      {items.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["ALL", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                category === c
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              )}
            >
              {c === "ALL" ? "All" : c === NONE ? "No category" : c}
              <span className={cn("rounded-full px-1.5 text-xs", category === c ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800")}>
                {c === "ALL" ? items.length : items.filter((it) => categoryOf(it) === c).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {hasPerm("item.manage") && shownItems.length > 0 && (
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
              checked={shownItems.every((it) => selected.has(it.id))}
              onChange={(e) => setSelected((current) => {
                // Adds or removes just the items shown, so picks from other categories stay.
                const next = new Set(current);
                for (const it of shownItems) {
                  if (e.target.checked) next.add(it.id); else next.delete(it.id);
                }
                return next;
              })}
            />
            {category === "ALL" ? "Select all" : `Select all in ${category === NONE ? "No category" : category}`}
            {selected.size > 0 && <span className="text-blue-600">· {selected.size} selected</span>}
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

      {shownItems.length === 0 ? (
        <Card><Empty message="No items found" /></Card>
      ) : (
        <Paginated rows={groupByModel(shownItems)} resetKey={[category, q]}>{(pageGroups) => (
        <Table headers={["", "Item", "Stock", "Category", "Unit", "Cost", "Price", "SKU", ""]} rightAlign={[2, 5, 6]}>
          {pageGroups.flatMap((g) => [
            ...(g.items.length > 1 ? [(
              <tr key={g.key} className="bg-gray-50 dark:bg-gray-800/50">
                <td className="w-8 px-3 py-2" />
                <td className="px-3 py-2 font-semibold" colSpan={2}>
                  {g.model}
                  <span className="ml-2 text-xs font-normal text-gray-500">{`${g.items.length} variants · stock ${g.items.reduce((n, it) => n + it.stockLevels.reduce((a, l) => a + l.quantity, 0), 0)}`}</span>
                </td>
                <td className="px-3 py-2" colSpan={6} />
              </tr>
            )] : []),
            ...g.items.map((it) => {
            const qty = it.stockLevels.reduce((a, l) => a + l.quantity, 0);
            const inGroup = g.items.length > 1;
            return (
              <tr key={it.id} className={cn(!it.active && "opacity-50", selected.has(it.id) && "bg-blue-50 dark:bg-blue-900/20")}>
                <td className="w-8 px-3 py-2.5">
                  {hasPerm("item.manage") && (
                    <input type="checkbox" className="h-4 w-4" aria-label={`Select ${it.name}`} checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  )}
                </td>
                <td className={cn("px-3 py-2.5 font-medium", inGroup && "pl-7")}>
                  {inGroup ? <><span className="text-gray-400">└ </span>{variantLabel(it)}</> : it.name}
                  {it.trackSerial && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">IMEI</span>}
                </td>
                {/* Stock sits next to the name: it is what a shop checks first. */}
                <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", it.minStock > 0 && qty < it.minStock && "text-red-600")}>
                  {qty}
                </td>
                <td className="px-3 py-2.5 text-xs">{it.category?.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs">{it.unit?.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(it.costPrice)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtMoney(it.sellingPrice)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{it.sku}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {hasPerm("item.manage") && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      setForm({
                        name: it.name, sku: it.sku, barcode: it.barcode ?? "",
                        // Start from what the item has, or saving the edit would clear them.
                        categoryId: it.categoryId ?? "", unitId: it.unitId ?? "",
                        costPrice: (Number(BigInt(it.costPrice)) / 100).toString(),
                        sellingPrice: (Number(BigInt(it.sellingPrice)) / 100).toString(),
                        minStock: it.minStock,
                        trackSerial: Boolean(it.trackSerial),
                        model: it.model ?? "", variant: it.variant ?? "",
                      });
                      setEditItem(it);
                      setShowNew(true);
                    }}>Edit</Button>
                  )}
                  {/* Variants are for phones (storage, colour), or a model already started. */}
                  {hasPerm("item.manage") && (it.model || isPhoneCategory(it.category?.name)) && (
                    <Button size="sm" variant="ghost" title="Add a variant of this model (another storage, colour…)" onClick={() => {
                      // A copy of this item, ready for the one thing that differs.
                      setForm({
                        ...empty,
                        categoryId: it.categoryId ?? "", unitId: it.unitId ?? "",
                        costPrice: (Number(BigInt(it.costPrice)) / 100).toString(),
                        sellingPrice: (Number(BigInt(it.sellingPrice)) / 100).toString(),
                        minStock: it.minStock,
                        trackSerial: Boolean(it.trackSerial),
                        model: it.model || it.name,
                      });
                      setEditItem(null);
                      setVariantOf(it);
                      setShowNew(true);
                    }}>+ Variant</Button>
                  )}
                </td>
              </tr>
            );
          }),
          ])}
        </Table>
        )}</Paginated>
      )}

      <Modal open={showNew} onClose={() => { setShowNew(false); setEditItem(null); setVariantOf(null); }} title={editItem ? `Edit ${editItem.name}` : variantOf ? `New variant of ${form.model}` : "New item"}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Model (groups variants)"
              value={form.model}
              placeholder="iPhone 13"
              onChange={(e) => {
                const model = e.target.value;
                const auto = !form.name || form.name === variantName(form.model, form.variant);
                setForm({ ...form, model, ...(auto ? { name: variantName(model, form.variant) } : {}) });
              }}
            />
            <Input
              label="Variant"
              value={form.variant}
              placeholder="128GB · Blue"
              autoFocus={Boolean(variantOf)}
              disabled={!form.model}
              onChange={(e) => {
                const variant = e.target.value;
                const auto = !form.name || form.name === variantName(form.model, form.variant);
                setForm({ ...form, variant, ...(auto ? { name: variantName(form.model, variant) } : {}) });
              }}
            />
          </div>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => setForm((f) => ({ ...f, name: autoCorrectName(f.name) }))} />
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
            <div>
              <Select label="Category" value={form.categoryId} onChange={(e) => {
                const name = meta.categories.find((c) => c.id === e.target.value)?.name;
                setForm({ ...form, categoryId: e.target.value, ...(editItem ? {} : { trackSerial: isPhoneCategory(name) }) });
              }}>
                <option value="">—</option>
                {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {missingPresets.length > 0 && hasPerm("item.manage") && (
                <button type="button" onClick={addPresets} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
                  + Add phone shop categories ({missingPresets.length})
                </button>
              )}
            </div>
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
          <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.trackSerial} onChange={(e) => setForm({ ...form, trackSerial: e.target.checked })} />
            <span>
              <span className="font-medium">Track IMEI / serial</span>
              <span className="block text-xs text-gray-500">Each phone has its own IMEI: entered when bought, picked when sold, and searchable.</span>
            </span>
          </label>
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
          {chosenWithStock.length > 0 && (
            <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <p>
                {`${chosenWithStock.length} item(s) still have stock and cannot be deleted. Sell them or adjust their stock to 0 first.`}
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelected((current) => {
                  const next = new Set(current);
                  for (const it of chosenWithStock) next.delete(it.id);
                  return next;
                })}
              >
                Deselect items with stock
              </Button>
            </div>
          )}
          <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
            {chosen.map((it) => {
              const qty = stockOf(it);
              return (
                <li key={it.id} className="flex justify-between gap-3">
                  <span className={cn(qty > 0 && "text-gray-400 line-through")}>{it.name}</span>
                  {qty > 0 && <span className="shrink-0 text-xs font-medium text-amber-600">stock {qty}</span>}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button>
            <Button variant="danger" onClick={runBulk} disabled={busy || selected.size === 0 || chosenWithStock.length > 0}>
              {busy ? "Deleting…" : `Delete ${selected.size}`}
            </Button>
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
                      {`${below} item(s) would sell below cost.`}
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
          {missingPresets.length > 0 && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm dark:bg-blue-900/30">
              <p className="text-gray-700 dark:text-gray-200">Phone shop categories you do not have yet:</p>
              <p className="mt-1 text-xs text-gray-500">{missingPresets.join(" · ")}</p>
              <Button size="sm" className="mt-2" onClick={addPresets}>Add phone shop categories</Button>
            </div>
          )}
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

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
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const empty = { name: "", sku: "", barcode: "", categoryId: "", unitId: "", costPrice: "0", sellingPrice: "0", minStock: 0 };
  const [form, setForm] = useState(empty);
  const [metaForm, setMetaForm] = useState({ kind: "category", name: "" });

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "200" });
    if (q) params.set("q", q);
    api<{ items: Item[] }>(`/api/v1/items?${params}`)
      .then((d) => setItems(d.items))
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

      {items.length === 0 ? (
        <Card><Empty message="No items found" /></Card>
      ) : (
        <Table headers={["Item", "SKU", "Category", "Unit", "Cost", "Price", "Stock", ""]} rightAlign={[4, 5, 6]}>
          {items.map((it) => {
            const qty = it.stockLevels.reduce((a, l) => a + l.quantity, 0);
            return (
              <tr key={it.id} className={!it.active ? "opacity-50" : ""}>
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

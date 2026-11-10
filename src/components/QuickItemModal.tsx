"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Button, Input, Modal, Select, useToast } from "@/components/ui";

/** An item made from inside another form (a purchase), so a part on a supplier's slip that
 *  is not in the list yet is added without leaving it. Name, category and selling price only;
 *  the cost comes from the purchase itself. */

interface Category { id: string; name: string; parentId?: string | null }
export interface QuickItem { id: string; name: string; sku: string; costPrice: string; sellingPrice: string; trackSerial?: boolean; trackStock?: boolean }

export function QuickItemModal({ name: startName, onClose, onMade }: { name: string; onClose: () => void; onMade: (item: QuickItem) => void }) {
  const { push } = useToast();
  const [name, setName] = useState(startName);
  const [categoryId, setCategoryId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/v1/item-meta").then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  // Each main category, then its sub-categories as "Spare Parts › LCD".
  const choices = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return categories
      .map((c) => ({ id: c.id, label: c.parentId ? `${byId.get(c.parentId)?.name ?? ""} › ${c.name}` : c.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categories]);

  async function save() {
    setBusy(true);
    try {
      const made = await api<QuickItem>("/api/v1/items", {
        method: "POST",
        body: { name: name.trim(), categoryId: categoryId || undefined, costPrice: "0", sellingPrice: sellingPrice.replace(/,/g, "") || "0" },
      });
      push(`${made.name} added to Items`);
      onMade(made);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New item"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Add item"}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <Input label="Selling price" value={sellingPrice} placeholder="0" inputMode="decimal" onChange={(e) => setSellingPrice(e.target.value)} />
        <p className="text-xs text-gray-500">{"The cost comes from this purchase. More details can be added later in Items."}</p>
      </div>
    </Modal>
  );
}

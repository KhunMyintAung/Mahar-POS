"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Modal, cn, useToast } from "@/components/ui";
import { CATEGORY_SEP } from "@/lib/productCsv";

export interface MetaCategory { id: string; name: string; parentId?: string | null; itemCount?: number }
export interface MetaUnit { id: string; name: string; itemCount?: number }

type Kind = "category" | "unit";
const smallField =
  "h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
interface Open { kind: Kind; id: string; name: string; moveTo: string; confirm: boolean }

/** Categories & Units: add, rename and delete in one window. A row tapped opens under itself
 *  (rename, and delete with where its items go), so nothing opens on top of the window. */
export function CategoryManager({ open, onClose, categories, units, onChanged }: {
  open: boolean;
  onClose: () => void;
  categories: MetaCategory[];
  units: MetaUnit[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Kind>("category");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const mains = categories.filter((c) => !c.parentId);
  const subsOf = (id: string) => categories.filter((c) => c.parentId === id);
  const label = (c: MetaCategory) => {
    const p = c.parentId ? categories.find((x) => x.id === c.parentId) : undefined;
    return p ? `${p.name}${CATEGORY_SEP}${c.name}` : c.name;
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const add = () => run(async () => {
    await api("/api/v1/item-meta", { method: "POST", body: { kind: tab, name: name.trim(), ...(tab === "category" && parentId ? { parentId } : {}) } });
    push(tab === "category" ? "Category added" : "Unit added");
    setName("");
    onChanged();
  });

  const rename = (o: Open) => run(async () => {
    await api("/api/v1/item-meta", { method: "PATCH", body: { kind: o.kind, id: o.id, name: o.name.trim() } });
    push("Saved");
    setEditing(null);
    onChanged();
  });

  const remove = (o: Open) => run(async () => {
    const r = await api<{ moved: number }>("/api/v1/item-meta", {
      method: "DELETE",
      body: { kind: o.kind, id: o.id, ...(o.moveTo ? { moveTo: o.moveTo } : {}) },
    });
    push(r.moved ? `Deleted · ${r.moved} item(s) moved` : "Deleted");
    setEditing(null);
    onChanged();
  });

  function toggle(kind: Kind, id: string, current: string) {
    setEditing(editing?.id === id ? null : { kind, id, name: current, moveTo: "", confirm: false });
  }

  /** The panel under an open row: rename, then delete with where its items go. */
  function panel(o: Open, count: number, original: string, hasSubs?: boolean) {
    const targets = o.kind === "category"
      ? categories.filter((c) => c.id !== o.id && c.parentId !== o.id).map((c) => ({ id: c.id, label: label(c) })).sort((a, b) => a.label.localeCompare(b.label))
      : units.filter((u) => u.id !== o.id).map((u) => ({ id: u.id, label: u.name }));
    return (
      <div className="space-y-2 rounded-b-lg border border-t-0 border-gray-200 bg-gray-50 p-2.5 text-xs dark:border-gray-700 dark:bg-gray-800/60">
        <div className="flex items-center gap-1.5">
          <input value={o.name} onChange={(e) => setEditing({ ...o, name: e.target.value })} aria-label="Name" className={smallField + " min-w-0 flex-1"} />
          <Button variant="secondary" size="sm" disabled={busy || !o.name.trim() || o.name.trim() === original} onClick={() => void rename(o)}>Save name</Button>
        </div>
        <div className="space-y-2 border-t border-gray-200 pt-2 dark:border-gray-700">
          {count > 0 ? (
            <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="shrink-0">{`Its ${count} item(s) go to`}</span>
              <select value={o.moveTo} onChange={(e) => setEditing({ ...o, moveTo: e.target.value, confirm: false })} className={smallField + " min-w-0 flex-1"}>
                <option value="">{o.kind === "category" ? "— (no category)" : "— (no unit)"}</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          ) : (
            <p className="text-xs text-gray-500">No item uses it.</p>
          )}
          {hasSubs && <p className="text-xs text-amber-700 dark:text-amber-300">Its sub-categories are deleted with it.</p>}
          {o.confirm ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-medium text-red-700 dark:text-red-300">{`Delete ${original}?`}</span>
              <Button variant="secondary" size="sm" onClick={() => setEditing({ ...o, confirm: false })}>No</Button>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove(o)}>Yes, delete</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing({ ...o, confirm: true })}
              className="text-xs font-medium text-red-600 hover:underline dark:text-red-400">
              {count > 0 && o.moveTo ? "Move items and delete" : "Delete"}
            </button>
          )}
        </div>
      </div>
    );
  }

  function row(kind: Kind, item: { id: string; name: string }, count: number, opts: { sub?: boolean; hasSubs?: boolean } = {}) {
    const { sub, hasSubs } = opts;
    const isOpen = editing?.id === item.id;
    return (
      <div key={item.id}>
        <button
          type="button"
          onClick={() => toggle(kind, item.id, item.name)}
          className={cn(
            "flex w-full items-center gap-2 border px-2.5 text-left",
            sub ? "py-1 text-xs text-gray-600 dark:text-gray-300" : "py-1.5 text-sm font-medium",
            isOpen ? "rounded-t-lg border-blue-300 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-900/20" : "rounded-lg border-gray-200 hover:border-blue-300 dark:border-gray-700"
          )}
        >
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <span className={cn("rounded-full px-1.5 text-[11px] font-normal", count ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" : "text-gray-400")}>
            {count}
          </span>
          {isOpen ? <ChevronDown size={13} className="text-blue-500" /> : <Pencil size={11} className="text-gray-400" />}
        </button>
        {isOpen && editing && panel(editing, count, item.name, hasSubs)}
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Categories & Units">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          {([["category", `Categories (${categories.length})`], ["unit", `Units (${units.length})`]] as const).map(([k, text]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setEditing(null); }}
              className={cn("flex-1 rounded-md px-3 py-1 text-xs font-medium", tab === k ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
              {text}
            </button>
          ))}
        </div>

        {/* One small row: name, (for a category) what it goes under, and Add. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void add(); }}
            placeholder={tab === "category" ? "New category" : "New unit"}
            aria-label={tab === "category" ? "New category" : "New unit"}
            className={smallField + " min-w-0 flex-1"}
          />
          {tab === "category" && (
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Under (for a sub-category)" className={smallField + " max-w-[45%]"}>
              <option value="">Main category</option>
              {mains.map((c) => <option key={c.id} value={c.id}>{`Under ${c.name}`}</option>)}
            </select>
          )}
          <Button size="sm" onClick={() => void add()} disabled={busy || !name.trim()}><Plus size={14} className="mr-0.5 inline" />Add</Button>
        </div>

        <p className="text-xs text-gray-500">Tap one to rename or delete it. The number is how many items use it.</p>

        {tab === "category" ? (
          <div className="space-y-1.5">
            {mains.length === 0 && <p className="text-sm text-gray-500">No categories yet</p>}
            {mains.map((c) => {
              const subs = subsOf(c.id);
              const total = (c.itemCount ?? 0) + subs.reduce((n, x) => n + (x.itemCount ?? 0), 0);
              return (
                <div key={c.id} className="space-y-0.5">
                  {row("category", c, total, { hasSubs: subs.length > 0 })}
                  {subs.length > 0 && (
                    <div className="ml-3 space-y-0.5 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
                      {subs.map((x) => row("category", x, x.itemCount ?? 0, { sub: true }))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {units.length === 0 && <p className="text-sm text-gray-500">No units yet</p>}
            {units.map((u) => row("unit", u, u.itemCount ?? 0))}
          </div>
        )}
        <p className="text-xs text-gray-500">Old sales and reports stay as they are after a delete. Adding the same name again brings it back.</p>
      </div>
    </Modal>
  );
}

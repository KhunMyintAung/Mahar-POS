"use client";

import { useCallback, useEffect, useState } from "react";
import { correctProductName } from "@/lib/autoCorrect";
import { TidyNames } from "@/components/TidyNames";
import { Download, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, cn, useToast } from "@/components/ui";
import { PHONE_CONDITIONS, isPhoneCategory, isSecondHandPhone } from "@/lib/itemCategoryPresets";
import { CATEGORY_SEP } from "@/lib/productCsv";
import { Paginated } from "@/components/Pager";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { BarcodeInput } from "@/components/BarcodeScanner";
import { ProductImport } from "@/components/ProductImport";
import { CategoryManager, type MetaCategory, type MetaUnit } from "@/components/CategoryManager";
import { repriced, validRule, type RepriceDirection, type RepriceMode, type RepriceRule } from "@/lib/reprice";
import { PageHeader } from "@/components/PageHeader";
import { groupByModel, variantLabel, variantName } from "@/lib/variants";
import { StockAdjustModal, StockMovements, type StockLevel } from "@/components/StockTools";
import { ImeiListModal, ImeiMatches } from "@/components/ImeiTools";
import { EXPIRY_WARN_DAYS, daysLeft } from "@/lib/expiry";
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn";

interface Item {
  id: string; name: string; sku: string; barcode?: string; active: boolean;
  costPrice: string; sellingPrice: string; minStock: number; trackSerial?: boolean;
  categoryId?: string | null; unitId?: string | null;
  category?: { name: string }; unit?: { name: string };
  stockLevels: { branchId: string; quantity: number }[];
  /** Variants: the model this item belongs to, and what sets it apart. */
  model?: string | null; variant?: string | null;
  /** Best before (a mini mart's food, drinks, medicine), as an ISO date. */
  expiresAt?: string | null;
  /** A second-hand phone: its condition and battery health (%). */
  condition?: string | null; batteryHealth?: number | null;
}
/** "Good · Battery 87%" for a second-hand phone; empty when neither is set. */
const conditionText = (it: { condition?: string | null; batteryHealth?: number | null }) =>
  [it.condition, it.batteryHealth != null ? `Battery ${it.batteryHealth}%` : ""].filter(Boolean).join(" · ");
/** A soft tint for a stock count, so empty, running-low and healthy stock read at a glance:
 *  none left is red, at or under the minimum (or 2 when none is set) is amber, a few is
 *  plain, and plenty is green. */
function qtyTone(qty: number, minStock: number) {
  const low = Math.max(minStock, 2);
  if (qty <= 0) return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  if (qty <= low) return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (qty < low * 3) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
}
const QtyPill = ({ qty, minStock }: { qty: number; minStock: number }) => (
  <span className={cn("inline-block min-w-8 rounded-md px-1.5 py-0.5 text-center", qtyTone(qty, minStock))}>{qty}</span>
);

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
/** Expired (red) or within a month of it (amber); nothing while there is time. */
const ExpiryPill = ({ expiresAt }: { expiresAt: string }) => {
  const days = daysLeft(expiresAt, today());
  if (days > EXPIRY_WARN_DAYS) return null;
  return (
    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", days < 0 ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300")}>
      {days < 0 ? "Expired" : days === 0 ? "Expires today" : `${days}d left`}
    </span>
  );
};

interface Meta { categories: MetaCategory[]; units: MetaUnit[] }

export default function ItemsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [meta, setMeta] = useState<Meta>({ categories: [], units: [] });
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("ALL");
  /** The item whose full name and details are open under its row (names stay one line). */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"reprice" | "delete" | null>(null);
  const [rule, setRule] = useState<{ mode: RepriceMode; value: string; direction: RepriceDirection; roundTo: string }>(
    { mode: "percent", value: "", direction: "down", roundTo: "100" }
  );
  const { push } = useToast();
  const { hasPerm, featureEnabled, branches, defaultBranchId, phoneShop } = useAuth();

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

  const empty = { name: "", sku: "", barcode: "", categoryId: "", unitId: "", costPrice: "0", sellingPrice: "0", minStock: 0, trackSerial: false, model: "", variant: "", expiresAt: "", condition: "", batteryHealth: "" };
  // The item a new variant is copied from, so it can be put under the same model too.
  const [variantOf, setVariantOf] = useState<Item | null>(null);
  // Models whose variants are shown in the list (closed by default).
  const [openModels, setOpenModels] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(empty);
  // Stock, merged in from the old Stock page: the movements tab, each item's stock levels,
  // a low-stock filter, and the Adjust and IMEI dialogs.
  const [view, setView] = useState<"items" | "movements">("items");
  const [levels, setLevels] = useState<Map<string, StockLevel>>(new Map());
  const [lowOnly, setLowOnly] = useState(false);
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [adjustFor, setAdjustFor] = useState<StockLevel | null>(null);
  const [imeiFor, setImeiFor] = useState<StockLevel | null>(null);
  const canStock = featureEnabled("stock") && hasPerm("stock.view");
  // The server sends 0 for the cost to a cashier or technician; the page shows "—" instead.
  const showCost = hasPerm("report.view") || hasPerm("item.manage");
  const costText = (minor: string) => (showCost ? fmtMoney(minor) : "—");

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
    if (canStock) api<StockLevel[]>("/api/v1/stock").then((ls) => setLevels(new Map(ls.map((l) => [l.itemId, l])))).catch(() => {});
  }, [q, push, canStock]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useRefreshOnReturn(load);

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
            expiresAt: form.expiresAt,
            condition: form.condition.trim(),
            batteryHealth: form.batteryHealth === "" ? null : Math.min(100, Math.max(0, parseInt(form.batteryHealth) || 0)),
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
            condition: form.condition.trim() || undefined,
            batteryHealth: form.batteryHealth === "" ? undefined : Math.min(100, Math.max(0, parseInt(form.batteryHealth) || 0)),
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

  if (!items) return <Spinner />;

  // Filtered by category the same way as Stock, so a whole shelf — all the glass, all the
  // spare parts — can be picked out and selected at once.
  const NONE = "—";
  // A sub-category shows with its category: "Accessory › Earphone".
  const catLabel = (id: string | null | undefined, fallback?: string) => {
    const c = id ? meta.categories.find((x) => x.id === id) : undefined;
    if (!c) return fallback;
    const parent = c.parentId ? meta.categories.find((x) => x.id === c.parentId) : undefined;
    return parent ? `${parent.name}${CATEGORY_SEP}${c.name}` : c.name;
  };
  const categoryOf = (it: Item) => catLabel(it.categoryId, it.category?.name) ?? NONE;
  // The chips show main categories only; a main one picked shows its sub-categories in a
  // second row, so a file with many sub-categories does not fill the screen with chips.
  const mainOf = (it: Item) => categoryOf(it).split(CATEGORY_SEP)[0];
  const byNone = (a: string, b: string) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b));
  const categories = [...new Set(items.map(mainOf))].sort(byNone);
  const openMain = category === "ALL" ? null : category.split(CATEGORY_SEP)[0];
  const subChips = openMain
    ? [...new Set(items.filter((it) => mainOf(it) === openMain).map(categoryOf))].filter((c) => c !== openMain).sort()
    : [];
  const inCategory = (it: Item) =>
    category === "ALL" || categoryOf(it) === category || (!category.includes(CATEGORY_SEP) && mainOf(it) === category);
  const isLow = (it: Item) => Boolean(levels.get(it.id)?.low);
  const isExpiring = (it: Item) => Boolean(it.expiresAt) && daysLeft(it.expiresAt!, today()) <= EXPIRY_WARN_DAYS;
  const shownItems = items.filter((it) => inCategory(it) && (!lowOnly || isLow(it)) && (!expiringOnly || isExpiring(it)));
  const expiringCount = items.filter(isExpiring).length;
  const stockOf = (it: Item) => it.stockLevels.reduce((a, l) => a + l.quantity, 0);
  const lowCount = items.filter(isLow).length;
  const stockValue = shownItems.reduce((sum, it) => sum + BigInt(it.costPrice) * BigInt(Math.max(0, stockOf(it))), 0n);
  const chosen = items.filter((it) => selected.has(it.id));
  const chosenWithStock = chosen.filter((it) => stockOf(it) > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader
        title={<>Items</>}
        lead={
          <>
            {canStock && (
              <div className="flex shrink-0 gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
                {([["items", "Items"], ["movements", "Movements"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setView(k)} className={cn("rounded-md px-3 py-1 text-sm font-medium", view === k ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {view === "items" && (
              <input placeholder={phoneShop ? "Search name, SKU, IMEI or barcode…" : "Search name, SKU or barcode…"} value={q} onChange={(e) => setQ(e.target.value)} className="min-h-9 w-full min-w-0 basis-full rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:max-w-sm sm:flex-1 sm:basis-auto sm:text-sm" />
            )}
            {view === "items" && canStock && showCost && (
              <span className="whitespace-nowrap text-sm text-gray-500">
                <span>Value:</span> <b className="tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(stockValue.toString())}</b>
              </span>
            )}
            {view === "items" && lowCount > 0 && (
              <button type="button" onClick={() => setLowOnly((v) => !v)} className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium", lowOnly ? "bg-red-600 text-white" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")}>
                {`${lowCount} low stock`}
              </button>
            )}
            {view === "items" && expiringCount > 0 && (
              <button type="button" onClick={() => setExpiringOnly((v) => !v)} className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium", expiringOnly ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300")}>
                {`${expiringCount} expiring`}
              </button>
            )}
          </>
        }
      >
        {view === "items" && <div className="flex flex-wrap gap-1.5">
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
              <TidyNames onDone={load} />
              <Button onClick={() => { setForm(empty); setEditItem(null); setShowNew(true); }}>
                <Plus size={16} className="mr-1 inline" />New item
              </Button>
            </>
          )}
        </div>}
      </PageHeader>

      {view === "movements" ? <StockMovements /> : (<>
      {q.trim() && [...levels.values()].some((l) => l.trackSerial) && <ImeiMatches query={q} />}

      {items.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["ALL", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                (c === "ALL" ? category === "ALL" : openMain === c)
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              )}
            >
              {c === "ALL" ? "All" : c === NONE ? "No category" : c}
              <span className={cn("rounded-full px-1.5 text-xs", (c === "ALL" ? category === "ALL" : openMain === c) ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800")}>
                {c === "ALL" ? items.length : items.filter((it) => mainOf(it) === c).length}
              </span>
            </button>
          ))}
        </div>
      )}
      {openMain && subChips.length > 0 && (
        <div className="-mt-1 flex gap-1.5 overflow-x-auto pb-1 pl-2">
          {[openMain, ...subChips].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                category === c
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/40 dark:text-blue-200"
                  : "border-gray-200 bg-white text-gray-600 hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              )}
            >
              {c === openMain ? "All" : c.split(CATEGORY_SEP)[1]}
              <span className="text-gray-400">
                {c === openMain ? items.filter((it) => mainOf(it) === c).length : items.filter((it) => categoryOf(it) === c).length}
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
          {pageGroups.flatMap((g) => {
            // A model is one line, like any item; its variants open under it on View variants
            // (and while searching, so a match is never hidden).
            const many = g.items.length > 1;
            const open = !many || openModels.has(g.key) || Boolean(q.trim());
            const stockAll = g.items.reduce((n, it) => n + it.stockLevels.reduce((a, l) => a + l.quantity, 0), 0);
            const range = (pick: (it: Item) => string) => {
              const v = g.items.map((it) => BigInt(pick(it)));
              const lo = v.reduce((a, b) => (b < a ? b : a));
              const hi = v.reduce((a, b) => (b > a ? b : a));
              return lo === hi ? fmtMoney(lo.toString()) : `${fmtMoney(lo.toString())} – ${fmtMoney(hi.toString())}`;
            };
            return [
            ...(many ? [(
              <tr key={g.key}>
                <td className="w-8 px-3 py-2.5" />
                <td className="max-w-[18rem] truncate px-3 py-2.5 font-semibold" title={g.model ?? undefined}>
                  {g.model}
                  <span className="ml-2 text-xs font-normal text-gray-500">{`${g.items.length} variants`}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums"><QtyPill qty={stockAll} minStock={Math.max(...g.items.map((it) => it.minStock))} /></td>
                <td className="px-3 py-2.5 text-xs">{catLabel(g.items[0].categoryId, g.items[0].category?.name) ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs">{g.items[0].unit?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{showCost ? range((it) => it.costPrice) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{range((it) => it.sellingPrice)}</td>
                <td className="px-3 py-2.5" />
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <Button size="sm" variant="secondary" onClick={() => setOpenModels((m) => { const n = new Set(m); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
                    {open ? "Hide variants" : "View variants"}
                  </Button>
                </td>
              </tr>
            )] : []),
            ...(open ? g.items : []).flatMap((it) => {
            const qty = it.stockLevels.reduce((a, l) => a + l.quantity, 0);
            const inGroup = g.items.length > 1;
            return [(
              <tr key={it.id} className={cn(!it.active && "opacity-50", inGroup && "bg-gray-50/70 dark:bg-gray-800/40", isLow(it) && "bg-red-50 dark:bg-red-900/10", selected.has(it.id) && "bg-blue-50 dark:bg-blue-900/20")}>
                <td className="w-8 px-3 py-2.5">
                  {hasPerm("item.manage") && (
                    <input type="checkbox" className="h-4 w-4" aria-label={`Select ${it.name}`} checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  )}
                </td>
                <td className={cn("px-3 py-2.5 font-medium", inGroup && "pl-7")}>
                  <button
                    type="button"
                    aria-expanded={detailId === it.id}
                    title={it.name}
                    onClick={() => setDetailId((id) => (id === it.id ? null : it.id))}
                    className="flex max-w-[18rem] items-center gap-1.5 text-left hover:text-blue-600"
                  >
                    <span className="min-w-0 truncate">{inGroup ? <><span className="text-gray-400">└ </span>{variantLabel(it)}</> : it.name}</span>
                    {it.expiresAt && <ExpiryPill expiresAt={it.expiresAt} />}
                    {it.trackSerial && <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">IMEI</span>}
                  </button>
                  {conditionText(it) && <div className={cn("text-xs font-normal text-gray-500", inGroup && "pl-3")}>{conditionText(it)}</div>}
                </td>
                {/* Stock sits next to the name: it is what a shop checks first. */}
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                  <QtyPill qty={qty} minStock={it.minStock} />
                </td>
                <td className="px-3 py-2.5 text-xs">{catLabel(it.categoryId, it.category?.name) ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs">{it.unit?.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{costText(it.costPrice)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtMoney(it.sellingPrice)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{it.sku}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {levels.get(it.id)?.trackSerial && (
                    <Button size="sm" variant="ghost" onClick={() => setImeiFor(levels.get(it.id)!)}>{`IMEI ${levels.get(it.id)!.imeiInStock ?? 0}/${levels.get(it.id)!.totalQty}`}</Button>
                  )}
                  {canStock && hasPerm("stock.adjust") && levels.get(it.id) && (
                    <Button size="sm" variant="ghost" onClick={() => setAdjustFor(levels.get(it.id)!)}>Adjust</Button>
                  )}
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
                        expiresAt: it.expiresAt?.slice(0, 10) ?? "",
                        condition: it.condition ?? "",
                        batteryHealth: it.batteryHealth != null ? String(it.batteryHealth) : "",
                      });
                      setEditItem(it);
                      setShowNew(true);
                    }}>Edit</Button>
                  )}
                  {/* A phone shop: variants (storage, colour) are for phones only (Phone New / Second),
                      not spare parts or accessories named after a phone. Other shops: a model already started. */}
                  {hasPerm("item.manage") && (phoneShop ? isPhoneCategory(catLabel(it.categoryId, it.category?.name)) : Boolean(it.model)) && (
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
            ), ...(detailId === it.id ? [(
              <tr key={`${it.id}-detail`} className="bg-blue-50/40 dark:bg-blue-950/20">
                <td />
                <td colSpan={8} className="px-3 pb-3 pt-1 text-sm">
                  <div className="whitespace-normal break-words font-medium">{it.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                    <span>{`SKU ${it.sku}`}</span>
                    {it.barcode && <span>{`Barcode ${it.barcode}`}</span>}
                    <span>{`Category ${catLabel(it.categoryId, it.category?.name) ?? "—"}`}</span>
                    <span>{`Cost ${costText(it.costPrice)} · Price ${fmtMoney(it.sellingPrice)}`}</span>
                    <span>{`Min stock ${it.minStock}`}</span>
                    {it.expiresAt && <span>{`Expires ${it.expiresAt.slice(0, 10)}`}</span>}
                    {it.stockLevels.length > 1 && it.stockLevels.map((l) => (
                      <span key={l.branchId}>{`${branches.find((b) => b.id === l.branchId)?.name ?? "Branch"}: ${l.quantity}`}</span>
                    ))}
                  </div>
                </td>
              </tr>
            )] : [])];
          }),
          ];
          })}
        </Table>
        )}</Paginated>
      )}
      </>)}

      {adjustFor && <StockAdjustModal key={adjustFor.itemId} target={adjustFor} onClose={() => setAdjustFor(null)} onDone={load} />}
      {imeiFor && (
        <ImeiListModal
          item={imeiFor}
          branchId={defaultBranchId || branches[0]?.id || ""}
          stockQty={imeiFor.byBranch.find((b) => b.branchId === (defaultBranchId || branches[0]?.id))?.quantity ?? 0}
          canAdjust={hasPerm("stock.adjust")}
          onClose={() => setImeiFor(null)}
          onChanged={load}
        />
      )}

      <Modal open={showNew} onClose={() => { setShowNew(false); setEditItem(null); setVariantOf(null); }} title={editItem ? `Edit ${editItem.name}` : variantOf ? `New variant of ${form.model}` : "New item"}>
        <div className="space-y-3">
          {/* Category, then one of its sub-categories (Spare Parts › LCD) when it has any, and the unit. */}
          {(() => {
            const picked = meta.categories.find((c) => c.id === form.categoryId);
            const mainId = picked?.parentId ?? picked?.id ?? "";
            const subs = meta.categories.filter((c) => c.parentId && c.parentId === mainId).sort((a, b) => a.name.localeCompare(b.name));
            const choose = (id: string) => {
              const name = catLabel(id);
              setForm({ ...form, categoryId: id, ...(editItem || !phoneShop ? {} : { trackSerial: isPhoneCategory(name) }) });
            };
            return (
              <div className={cn("grid items-end gap-3", subs.length > 0 ? "grid-cols-3" : "grid-cols-2")}>
                <Select label="Category" value={mainId} onChange={(e) => choose(e.target.value)}>
                  <option value="">—</option>
                  {meta.categories.filter((c) => !c.parentId).sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                {subs.length > 0 && (
                  <Select label="Sub-category" value={picked?.parentId ? picked.id : ""} onChange={(e) => choose(e.target.value || mainId)}>
                    <option value="">—</option>
                    {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
                <Select label="Unit" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                  <option value="">—</option>
                  {meta.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </div>
            );
          })()}
          {/* Model and variant come after the category: in a phone shop for phones only. */}
          {(form.model || (form.categoryId && (!phoneShop || isPhoneCategory(catLabel(form.categoryId))))) && (
            <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Model (groups variants)"
                value={form.model}
                placeholder={phoneShop ? "iPhone 13" : "Coca Cola"}
                onChange={(e) => {
                  const model = e.target.value;
                  const auto = !form.name || form.name === variantName(form.model, form.variant);
                  setForm({ ...form, model, ...(auto ? { name: variantName(model, form.variant) } : {}) });
                }}
              />
              <Input
                label="Variant"
                value={form.variant}
                placeholder={phoneShop ? "128GB · Blue" : "330ml"}
                autoFocus={Boolean(variantOf)}
                disabled={!form.model}
                onChange={(e) => {
                  const variant = e.target.value;
                  const auto = !form.name || form.name === variantName(form.model, form.variant);
                  setForm({ ...form, variant, ...(auto ? { name: variantName(form.model, variant) } : {}) });
                }}
              />
            </div>
            </>
          )}
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => setForm((f) => ({ ...f, name: correctProductName(f.name, phoneShop) }))} />
          {(isSecondHandPhone(catLabel(form.categoryId)) || form.condition || form.batteryHealth) && (
            // A second-hand phone: what a buyer asks first.
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Input label="Condition" list="phone-conditions" value={form.condition} placeholder="Like new, small scratches…"
                  onChange={(e) => setForm({ ...form, condition: e.target.value })} />
                <datalist id="phone-conditions">{PHONE_CONDITIONS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <Input label="Battery health (%)" type="number" inputMode="numeric" min={0} max={100} placeholder="e.g. 87"
                value={form.batteryHealth} onChange={(e) => setForm({ ...form, batteryHealth: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Cost price" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} inputMode="decimal" />
            <Input label="Selling price" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} inputMode="decimal" />
            <Input label="Min stock" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: parseInt(e.target.value) || 0 })} />
          </div>
          {/* Best before: a mini mart's food, drinks and medicine. */}
          {(!phoneShop || form.expiresAt) && (
            <Input label="Expiry date (optional)" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          )}
          {(phoneShop || form.trackSerial) && <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.trackSerial} onChange={(e) => setForm({ ...form, trackSerial: e.target.checked })} />
            <span>
              <span className="font-medium">Track IMEI / serial</span>
              <span className="block text-xs text-gray-500">Each phone has its own IMEI: entered when bought, picked when sold, and searchable.</span>
            </span>
          </label>}
          {/* Optional: an SKU is made from the name when left empty. */}
          <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Optional</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="SKU"
                value={form.sku}
                disabled={!!editItem}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder={editItem ? "" : "Made from the name"}
              />
              <BarcodeInput
                label="Barcode"
                value={form.barcode}
                onChange={(barcode) => setForm({ ...form, barcode })}
              />
            </div>
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

      <CategoryManager open={showMeta} onClose={() => setShowMeta(false)} categories={meta.categories} units={meta.units} onChanged={load} />
    </div>
  );
}

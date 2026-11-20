"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ClipboardCheck, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { normalizeImei } from "@/lib/imeiInput";
import { matchesWords } from "@/lib/searchWords";
import { Badge, Button, Card, ConfirmDialog, Empty, Input, Modal, ProgressBar, Select, Spinner, cn, useToast } from "@/components/ui";
import { useAuth, useCurrency } from "@/components/AppShell";
import { BarcodeScannerModal, scanningSupported } from "@/components/BarcodeScanner";

/** Stock count (stocktake): the books are the list, and each line is looked for on the shelf.
 *  An item in the books but not on the shelf stays "Not counted" until someone finds it or
 *  marks it 0, so nothing missing slips by. Finishing it corrects the stock to what was found.
 *
 *  Built for a phone at the shelf: the progress and the Finish button stay in view while the list
 *  scrolls, one box scans (a scanner gun, or the phone's camera, counting each item as it is
 *  read) or searches, and each row is a tap away from "all there" or "not found". */

interface CountRow {
  id: string; txnNo: string; status: string; branchId: string; branch: string; categoryName?: string | null; notes?: string | null;
  createdAt: string; completedAt?: string | null; createdBy: string;
  items: number; counted: number; short: number; over: number; shortValue: string; overValue: string;
}
interface Line {
  itemId: string; name: string; sku: string; barcode?: string | null; category: string; trackSerial: boolean;
  expectedQty: number; countedQty: number | null; countedImeis: string[]; expectedImeis: string[];
  adjustment: number | null; unitCost: string;
}
interface CountDetail {
  id: string; txnNo: string; status: string; branchId: string; branch: string; categoryName?: string | null;
  notes?: string | null; createdAt: string; completedAt?: string | null; lines: Line[];
}
interface Category { id: string; name: string; parentId?: string | null }

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function StockCounts() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <CountSheet id={openId} onBack={() => setOpenId(null)} /> : <CountList onOpen={setOpenId} />;
}

function CountList({ onOpen }: { onOpen: (id: string) => void }) {
  const cur = useCurrency();
  const { hasPerm, branches, defaultBranchId } = useAuth();
  const { push } = useToast();
  const canStart = hasPerm("stock.adjust") && hasPerm("item.manage");
  const seeCost = hasPerm("report.view") || hasPerm("item.manage");
  const [rows, setRows] = useState<CountRow[] | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    api<CountRow[]>("/api/v1/stock-counts").then(setRows).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  const empty = rows !== null && rows.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Card className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardCheck size={18} className="text-blue-600" />
          <span className="font-semibold">Stock count</span>
          {canStart && !empty && (
            <Button className="ml-auto" onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New stock count</Button>
          )}
        </div>
        <p className="text-sm text-gray-500">Check the shelf against your books, so a missing item is never overlooked.</p>
      </Card>

      {rows === null ? <Spinner /> : empty ? (
        <Card className="space-y-4">
          <div className="text-center">
            <ClipboardCheck size={34} className="mx-auto text-blue-600" />
            <div className="mt-2 font-semibold">Count your stock in 3 steps</div>
          </div>
          <ol className="space-y-3 text-sm">
            {[
              "Start a count — all items, or one shelf at a time.",
              "Go through the list: scan an item, tap ✓ if it is all there, or enter how many you found.",
              "Finish — your stock is corrected to what you counted.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          {canStart && (
            <Button className="min-h-12 w-full text-base sm:min-h-10 sm:text-sm" onClick={() => setShowNew(true)}><Plus size={18} className="mr-1 inline" />Start a stock count</Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="block w-full text-left">
              <Card className={cn("space-y-2 transition hover:border-blue-400", c.status === "OPEN" && "border-blue-300 dark:border-blue-800", c.status === "CANCELLED" && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.txnNo}</span>
                  <Badge status={c.status} />
                  <span className="text-sm text-gray-500">{c.branch}</span>
                  <span className="text-sm text-gray-500">·</span>
                  <span className="text-sm text-gray-500">{c.categoryName || "All items"}</span>
                  <span className="ml-auto text-xs tabular-nums text-gray-400">{dateTime(c.createdAt)}</span>
                </div>
                {c.status === "OPEN" ? (
                  <div className="flex items-end gap-3">
                    <div className="flex-1"><ProgressBar value={c.items ? c.counted / c.items : 0} label={<span className="tabular-nums">{c.counted} / {c.items}</span>} /></div>
                    <span className="shrink-0 pb-0.5 text-sm font-semibold text-blue-600 dark:text-blue-400">Continue counting ›</span>
                  </div>
                ) : c.status === "COMPLETED" ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span><span className="text-gray-500">Counted</span> <span className="tabular-nums font-medium">{c.counted} / {c.items}</span></span>
                    <span className="text-red-600"><span>Short</span> <span className="tabular-nums font-medium">{c.short}</span>{seeCost && c.short > 0 && <span className="tabular-nums"> ({fmtMoney(c.shortValue, cur)})</span>}</span>
                    <span className="text-green-700 dark:text-green-400"><span>Over</span> <span className="tabular-nums font-medium">{c.over}</span>{seeCost && c.over > 0 && <span className="tabular-nums"> ({fmtMoney(c.overValue, cur)})</span>}</span>
                  </div>
                ) : null}
              </Card>
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewCountModal
          branches={branches}
          defaultBranchId={defaultBranchId || branches[0]?.id || ""}
          openCounts={(rows ?? []).filter((c) => c.status === "OPEN")}
          onClose={() => setShowNew(false)}
          onContinue={(id) => { setShowNew(false); onOpen(id); }}
          onCreated={(id) => { setShowNew(false); onOpen(id); }}
        />
      )}
    </div>
  );
}

function NewCountModal({ branches, defaultBranchId, openCounts, onClose, onContinue, onCreated }: {
  branches: { id: string; name: string }[]; defaultBranchId: string; openCounts: CountRow[];
  onClose: () => void; onContinue: (id: string) => void; onCreated: (id: string) => void;
}) {
  const { push } = useToast();
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/v1/item-meta").then((m) => setCategories(m.categories)).catch(() => {});
  }, []);
  // Main categories, each followed by its sub-categories.
  const options = useMemo(() => {
    const mains = categories.filter((c) => !c.parentId);
    return mains.flatMap((m) => [
      { id: m.id, label: m.name },
      ...categories.filter((c) => c.parentId === m.id).map((s) => ({ id: s.id, label: `${m.name} › ${s.name}` })),
    ]);
  }, [categories]);

  // One open count per branch: say so up front, with the way to carry on with it, instead of
  // letting the shop press Start and meet an error.
  const openHere = openCounts.find((c) => c.branchId === branchId);

  async function start() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/v1/stock-counts", { method: "POST", body: { branchId, categoryId: categoryId || null } });
      onCreated(r.id);
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New stock count"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !branchId || !!openHere} onClick={start}>Start count</Button></div>}
    >
      <div className="space-y-3">
        {branches.length > 1 && (
          <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        {openHere && (
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>{`${openHere.txnNo} is still open for this branch. Finish or cancel it first.`}</p>
            <Button variant="secondary" onClick={() => onContinue(openHere.id)}>Continue counting</Button>
          </div>
        )}
        <Select label="What to count" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All items</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
        <p className="text-xs text-gray-500">A big shop is easier counted one category (one shelf) at a time.</p>
      </div>
    </Modal>
  );
}

type Filter = "todo" | "short" | "over" | "ok" | "all";
type ScanResult = "counted" | "imei" | "dup" | "none";

const diffOf = (l: Line) => (l.countedQty === null ? null : l.adjustment ?? l.countedQty - l.expectedQty);

function CountSheet({ id, onBack }: { id: string; onBack: () => void }) {
  const cur = useCurrency();
  const { hasPerm } = useAuth();
  const { push } = useToast();
  const canEdit = hasPerm("stock.adjust");
  const canFinish = hasPerm("stock.adjust") && hasPerm("item.manage");
  const seeCost = hasPerm("report.view") || hasPerm("item.manage");
  const [count, setCount] = useState<CountDetail | null>(null);
  const [filter, setFilterRaw] = useState<Filter>("todo");
  // Lines counted while looking at a list stay on it until the list changes, so tapping + a
  // few times (or fixing a typo) does not make the row jump away after the first tap.
  const [kept, setKept] = useState<Set<string>>(new Set());
  const setFilter = (f: Filter) => { setFilterRaw(f); setKept(new Set()); };
  // One box does both jobs: what is typed narrows the list, and Enter (or a scan) counts a
  // barcode or IMEI that matches.
  const [q, setQ] = useState("");
  const [imeiFor, setImeiFor] = useState<Line | null>(null);
  const [camera, setCamera] = useState(false);
  const [canCamera, setCanCamera] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "zero" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The camera is offered only where the browser can read barcodes; checked after mount.
  useEffect(() => {
    const timer = window.setTimeout(() => setCanCamera(scanningSupported()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(() => {
    api<CountDetail>(`/api/v1/stock-counts/${id}`).then((c) => { setCount(c); setKept(new Set()); if (c.status !== "OPEN") setFilterRaw("all"); }).catch((e) => push(e.message, "error"));
  }, [id, push]);
  useEffect(load, [load]);

  const open = count?.status === "OPEN";
  const editable = open && canEdit;

  const setLine = (itemId: string, patch: Partial<Line>) =>
    setCount((c) => (c ? { ...c, lines: c.lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) } : c));

  async function save(itemId: string, countedQty: number | null, imeis?: string[]) {
    const before = count?.lines.find((l) => l.itemId === itemId);
    setKept((k) => (k.has(itemId) ? k : new Set(k).add(itemId)));
    setLine(itemId, { countedQty, ...(imeis ? { countedImeis: imeis } : {}) });
    try {
      await api(`/api/v1/stock-counts/${id}`, { method: "PATCH", body: { entries: [{ itemId, countedQty, imeis }] } });
    } catch (e) {
      push((e as Error).message, "error");
      if (before) setLine(itemId, { countedQty: before.countedQty, countedImeis: before.countedImeis });
    }
  }

  /** A scanned barcode adds one of that item; a scanned IMEI ticks that phone. Says what it did,
   *  so the caller knows whether to keep the text, close the camera or complain. */
  function handleCode(raw: string): ScanResult {
    const code = raw.trim();
    if (!count || !code) return "none";
    const imei = normalizeImei(code);
    const phone = count.lines.find((l) => l.trackSerial && l.expectedImeis.includes(imei));
    if (phone) {
      if (phone.countedImeis.includes(imei)) { push(`IMEI ${imei} — already counted`, "error"); return "dup"; }
      save(phone.itemId, phone.countedImeis.length + 1, [...phone.countedImeis, imei]);
      push(`${phone.name} ✓`);
      return "counted";
    }
    const item = count.lines.find((l) => l.barcode === code || l.sku.toLowerCase() === code.toLowerCase());
    if (item && !item.trackSerial) {
      save(item.itemId, (item.countedQty ?? 0) + 1);
      push(`${item.name} ✓`);
      return "counted";
    }
    if (item?.trackSerial) { setImeiFor(item); return "imei"; }
    return "none";
  }

  // The camera keeps running between reads, so the handler it holds must not change with every
  // count (a new one would restart the camera): it reads the latest one through a ref.
  const cameraHandler = useRef<(code: string) => boolean>(() => true);
  useEffect(() => {
    cameraHandler.current = (code) => {
      const r = handleCode(code);
      if (r === "none") push(`${code} — not in this count`, "error");
      // A phone with several IMEIs needs ticking by hand: close the camera for that.
      return r !== "imei";
    };
  });
  const onCameraScan = useCallback((code: string) => cameraHandler.current(code), []);
  const closeCamera = useCallback(() => setCamera(false), []);

  async function act(kind: "finish" | "zero" | "cancel") {
    setBusy(true);
    try {
      if (kind === "zero") {
        const r = await api<{ marked: number }>(`/api/v1/stock-counts/${id}/zero`, { method: "POST" });
        push(`${r.marked} item(s) set to 0`);
        load();
      } else {
        await api(`/api/v1/stock-counts/${id}/${kind === "finish" ? "complete" : "cancel"}`, { method: "POST" });
        push(kind === "finish" ? "Stock corrected to the count" : "Stock count cancelled");
        load();
      }
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!count) return <Spinner />;

  const lines = count.lines;
  const counted = lines.filter((l) => l.countedQty !== null);
  const todo = lines.length - counted.length;
  const shortLines = counted.filter((l) => (diffOf(l) ?? 0) < 0);
  const overLines = counted.filter((l) => (diffOf(l) ?? 0) > 0);
  const shortQty = shortLines.reduce((n, l) => n - (diffOf(l) ?? 0), 0);
  const overQty = overLines.reduce((n, l) => n + (diffOf(l) ?? 0), 0);
  const shortValue = shortLines.reduce((n, l) => n + BigInt(l.unitCost) * BigInt(-(diffOf(l) ?? 0)), 0n);
  const overValue = overLines.reduce((n, l) => n + BigInt(l.unitCost) * BigInt(diffOf(l) ?? 0), 0n);

  const shown = lines.filter((l) => {
    const d = diffOf(l);
    if (kept.has(l.itemId)) return matchesWords(q, l.name, l.sku, l.barcode, l.category);
    if (filter === "todo" && l.countedQty !== null) return false;
    if (filter === "short" && !(d !== null && d < 0)) return false;
    if (filter === "over" && !(d !== null && d > 0)) return false;
    if (filter === "ok" && d !== 0) return false;
    return matchesWords(q, l.name, l.sku, l.barcode, l.category);
  });

  const filters: [Filter, string, number][] = [
    ...(open ? [["todo", "Not counted", todo] as [Filter, string, number]] : []),
    ["short", "Short", shortLines.length],
    ["over", "Over", overLines.length],
    ["ok", "Matches", counted.length - shortLines.length - overLines.length],
    ["all", "All", lines.length],
  ];

  /** Enter in the box: a barcode or IMEI that matches is counted and the box cleared; text that
   *  matches nothing but still finds items is just a search; text that finds nothing is said so. */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const text = q.trim();
    if (!text) return;
    const r = handleCode(text);
    if (r !== "none") setQ("");
    else if (shown.length === 0) push(`${text} — not in this count`, "error");
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-20 lg:pb-0">
      {/* Stays in view while the list scrolls: where this count is, and the way to finish it. */}
      <div className="sticky top-0 z-20 -mx-3 space-y-1 border-b border-gray-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:-mx-4 sm:px-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" aria-label="Back" onClick={onBack}><ArrowLeft size={18} /></Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap font-semibold">{count.txnNo}</span>
              <Badge status={count.status} />
            </div>
            <div className="truncate text-xs text-gray-500">{count.branch} · {count.categoryName || "All items"}</div>
          </div>
          {editable && canFinish && (
            // A short word here (the bar is narrow); the confirmation that follows spells out what finishing does.
            <Button className="shrink-0" disabled={busy || counted.length === 0} onClick={() => setConfirm("finish")}><Check size={16} className="mr-1 inline" />Finish</Button>
          )}
        </div>
        <ProgressBar value={lines.length ? counted.length / lines.length : 0} label={<span className="tabular-nums">{counted.length} / {lines.length}</span>} />
      </div>

      {count.status === "COMPLETED" && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">This count is finished. The stock was corrected to what was counted.</p>
      )}
      {count.status === "CANCELLED" && (
        <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">This count was cancelled. No stock changed.</p>
      )}

      <form className="flex gap-2" onSubmit={submit}>
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="done"
            placeholder={editable ? "Scan, or search name, SKU or IMEI" : "Search name, SKU or barcode…"}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800/80"
          />
          {q && (
            <button type="button" aria-label="Clear" className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setQ(""); inputRef.current?.focus(); }}>
              <X size={16} />
            </button>
          )}
        </div>
        {editable && canCamera && (
          <Button type="button" variant="secondary" aria-label="Scan with the camera" className="min-h-11 px-3.5" onClick={() => setCamera(true)}>
            <Camera size={20} />
          </Button>
        )}
      </form>

      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {filters.map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium", filter === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>
            <span>{label}</span> <span className="tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      {(shortQty > 0 || overQty > 0) && (
        <p className="flex flex-wrap gap-x-4 text-sm">
          {shortQty > 0 && <span className="text-red-600"><span>Short</span> <span className="tabular-nums font-medium">{shortQty}</span>{seeCost && shortValue > 0n && <span className="tabular-nums"> ({fmtMoney(shortValue, cur)})</span>}</span>}
          {overQty > 0 && <span className="text-green-700 dark:text-green-400"><span>Over</span> <span className="tabular-nums font-medium">{overQty}</span>{seeCost && overValue > 0n && <span className="tabular-nums"> ({fmtMoney(overValue, cur)})</span>}</span>}
        </p>
      )}
      {editable && <p className="text-xs text-gray-500 sm:hidden">✓ = all there · ✗ = not found</p>}

      {shown.length === 0 ? (
        <Card><Empty message={filter === "todo" && !q ? "Every item is counted" : "Nothing here"} /></Card>
      ) : (
        <Card className="divide-y divide-gray-100 p-0 dark:divide-gray-800">
          {shown.map((l) => <CountLine key={l.itemId} line={l} editable={editable} seeCost={seeCost} cur={cur} onSave={save} onImei={() => setImeiFor(l)} />)}
        </Card>
      )}

      {editable && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canFinish && <Button className="min-h-12 text-base sm:min-h-10 sm:text-sm" disabled={busy || counted.length === 0} onClick={() => setConfirm("finish")}><Check size={18} className="mr-1 inline" />Finish count</Button>}
          {todo > 0 && <Button variant="secondary" className="min-h-12 text-base sm:min-h-10 sm:text-sm" disabled={busy} onClick={() => setConfirm("zero")}>Mark the rest as not found</Button>}
          {canFinish && <Button variant="ghost" className="text-red-600 sm:ml-auto" disabled={busy} onClick={() => setConfirm("cancel")}><X size={16} className="mr-1 inline" />Cancel count</Button>}
        </div>
      )}

      <BarcodeScannerModal open={camera} onClose={closeCamera} onScan={onCameraScan} title="Scan with the camera" />

      {imeiFor && (
        <ImeiCountModal
          line={count.lines.find((l) => l.itemId === imeiFor.itemId) ?? imeiFor}
          editable={!!editable}
          onClose={() => setImeiFor(null)}
          onSave={(imeis) => { save(imeiFor.itemId, imeis.length, imeis); setImeiFor(null); }}
        />
      )}

      <ConfirmDialog
        open={confirm === "finish"}
        onClose={() => setConfirm(null)}
        onConfirm={() => act("finish")}
        title="Finish count"
        confirmLabel="Correct the stock"
        message={
          <div className="space-y-2">
            <p>The stock of every counted item becomes what was counted. This cannot be undone.</p>
            <ul className="space-y-1">
              <li className="text-red-600"><span>Short</span> <span className="tabular-nums font-medium">{shortQty}</span>{seeCost && shortValue > 0n && <span className="tabular-nums"> ({fmtMoney(shortValue, cur)})</span>}</li>
              <li className="text-green-700 dark:text-green-400"><span>Over</span> <span className="tabular-nums font-medium">{overQty}</span>{seeCost && overValue > 0n && <span className="tabular-nums"> ({fmtMoney(overValue, cur)})</span>}</li>
              {todo > 0 && <li className="text-amber-600"><span>Not counted (left as they are)</span> <span className="tabular-nums font-medium">{todo}</span></li>}
            </ul>
          </div>
        }
      />
      <ConfirmDialog
        open={confirm === "zero"}
        onClose={() => setConfirm(null)}
        onConfirm={() => act("zero")}
        title="Mark the rest as not found"
        confirmLabel="Mark as not found"
        danger
        message={<p>Every item not counted yet is set to 0, as not found. Do this only after looking for all of them.</p>}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        onConfirm={() => act("cancel")}
        title="Cancel count"
        confirmLabel="Cancel count"
        danger
        message={<p>The count is dropped and no stock changes.</p>}
      />
    </div>
  );
}

/** One item to count. The books figure is at the right, where the eye goes to compare; below it
 *  the number found (− / + / typed) and, until it is counted, a tap for "all there" or "not found". */
function CountLine({ line, editable, seeCost, cur, onSave, onImei }: {
  line: Line; editable: boolean; seeCost: boolean; cur: string;
  onSave: (itemId: string, qty: number | null) => void; onImei: () => void;
}) {
  const [text, setText] = useState(line.countedQty === null ? "" : String(line.countedQty));
  // A scan or "Not found" changes the count from outside the box: show the new figure.
  const [shownQty, setShownQty] = useState(line.countedQty);
  if (shownQty !== line.countedQty) {
    setShownQty(line.countedQty);
    setText(line.countedQty === null ? "" : String(line.countedQty));
  }
  const d = diffOf(line);
  const untouched = line.countedQty === null;

  function commit() {
    const v = text.trim();
    const qty = v === "" ? null : Number(v);
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) { setText(line.countedQty === null ? "" : String(line.countedQty)); return; }
    if (qty !== line.countedQty) onSave(line.itemId, qty);
  }

  const step = (by: number) => {
    const next = Math.max(0, (line.countedQty ?? 0) + by);
    setText(String(next));
    onSave(line.itemId, next);
  };
  const stepBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl font-bold text-gray-700 active:bg-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200 dark:active:bg-gray-700";
  const quick = "flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold";

  /** The result: how far off the books the count is, with what that is worth. */
  const result = d === null ? null : (
    <div className="min-w-0 shrink-0 text-right">
      <div className={cn("text-xl font-bold tabular-nums leading-tight", d < 0 ? "text-red-600" : d > 0 ? "text-green-700 dark:text-green-400" : "text-gray-400")}>
        {d === 0 ? "✓" : d > 0 ? `+${d}` : d}
      </div>
      {seeCost && d !== 0 && <div className="text-xs tabular-nums text-gray-500">{fmtMoney(BigInt(line.unitCost) * BigInt(d), cur)}</div>}
    </div>
  );

  return (
    <div className={cn("space-y-2 px-3 py-3", d !== null && d < 0 && "bg-red-50/50 dark:bg-red-950/20", d !== null && d > 0 && "bg-green-50/50 dark:bg-green-950/20")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug">{line.name}</div>
          <div className="text-xs text-gray-500">{[line.sku, line.category].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-gray-500">Books</div>
          <div className="text-2xl font-semibold tabular-nums leading-none">{line.expectedQty}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {line.trackSerial ? (
          <button type="button" onClick={onImei} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-blue-500 font-semibold text-blue-600 dark:text-blue-400">
            <span className="text-xl tabular-nums">{line.countedQty ?? "?"}</span>
            <span>Tick IMEIs</span>
          </button>
        ) : editable ? (
          <>
            <button type="button" aria-label="Less" className={stepBtn} disabled={!line.countedQty} onClick={() => step(-1)}>−</button>
            <input
              inputMode="numeric"
              aria-label="Counted"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commit}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="?"
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-gray-300 bg-white text-center text-2xl font-semibold tabular-nums outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <button type="button" aria-label="More" className={stepBtn} onClick={() => step(1)}>+</button>
          </>
        ) : (
          <div className="flex-1">
            <span className="text-xs text-gray-500">Counted</span>{" "}
            <span className="text-xl font-semibold tabular-nums">{line.countedQty ?? "—"}</span>
          </div>
        )}

        {editable && !line.trackSerial && untouched ? (
          <>
            <button type="button" aria-label="All there" title="All there" onClick={() => onSave(line.itemId, line.expectedQty)} className={cn(quick, "bg-green-100 text-green-700 active:bg-green-200 dark:bg-green-900/40 dark:text-green-300")}>
              <Check size={20} /><span className="hidden sm:inline">All there</span>
            </button>
            <button type="button" aria-label="Not found" title="Not found" onClick={() => onSave(line.itemId, 0)} className={cn(quick, "bg-red-100 text-red-700 active:bg-red-200 dark:bg-red-900/40 dark:text-red-300")}>
              <X size={20} /><span className="hidden sm:inline">Not found</span>
            </button>
          </>
        ) : untouched ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Not counted</span>
        ) : result}
      </div>
    </div>
  );
}

/** An IMEI phone is counted phone by phone: tick each one the books hold that is on the
 *  shelf, and add any found that the books do not have. */
function ImeiCountModal({ line, editable, onClose, onSave }: { line: Line; editable: boolean; onClose: () => void; onSave: (imeis: string[]) => void }) {
  const [found, setFound] = useState<string[]>(line.countedImeis);
  const [extra, setExtra] = useState("");
  const all = [...new Set([...line.expectedImeis, ...found])];
  const toggle = (i: string) => setFound((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i]));

  function addExtra() {
    const v = normalizeImei(extra);
    if (v && !found.includes(v)) setFound((f) => [...f, v]);
    setExtra("");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={line.name}
      footer={editable ? (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(found)}>Save</Button>
        </div>
      ) : undefined}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Tick each phone that is on the shelf. A phone not ticked is short.</p>
        {all.length === 0 ? <Empty message="No IMEIs in the books" /> : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
            {all.map((i) => {
              const inBooks = line.expectedImeis.includes(i);
              return (
                <li key={i}>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" disabled={!editable} checked={found.includes(i)} onChange={() => toggle(i)} />
                    <span className="font-mono tabular-nums">{i}</span>
                    {!inBooks && <span className="ml-auto rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">Not in books</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {editable && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); addExtra(); }}>
            <div className="flex-1"><Input label="Found a phone not in the list? Its IMEI" value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
            <Button type="submit" variant="secondary">Add</Button>
          </form>
        )}
        <p className="text-sm"><span className="text-gray-500">Counted</span> <span className="font-semibold tabular-nums">{found.length}</span> <span className="text-gray-500">/</span> <span className="tabular-nums">{line.expectedQty}</span></p>
      </div>
    </Modal>
  );
}

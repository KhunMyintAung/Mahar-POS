"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ClipboardCheck, Download, EyeOff, Plus, Printer, Search, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { playBeep, playError } from "@/lib/sound";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { normalizeImei } from "@/lib/imeiInput";
import { matchesWords } from "@/lib/searchWords";
import { COUNT_REASONS, countReasonLabel } from "@/lib/stockCountReasons";
import { Badge, Button, Card, ConfirmDialog, Empty, Input, Modal, ProgressBar, Select, Spinner, Switch, cn, useToast } from "@/components/ui";
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
  adjustment: number | null; unitCost: string; reason?: string | null; note?: string | null;
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
  const { hasPerm, me } = useAuth();
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
  // Which shelf (category) of the count is on screen; "" is all of it.
  const [cat, setCat] = useState("");
  const [imeiFor, setImeiFor] = useState<Line | null>(null);
  const [camera, setCamera] = useState(false);
  const [canCamera, setCanCamera] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "zero" | "cancel" | null>(null);
  // A remark the person finishing may leave with the count.
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  // Blind count: the books figures are hidden while counting, so every item is looked at and
  // counted rather than agreed with. Remembered on this device; ended when it is time to review.
  const [blindPref, setBlindPref] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Checked after mount: the camera is offered only where the browser can read barcodes, and the
  // blind-count choice lives in this browser's storage.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCanCamera(scanningSupported());
      try { if (localStorage.getItem("mp-count-blind") === "1") setBlindPref(true); } catch { /* storage unavailable */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const setBlind = (on: boolean) => {
    setBlindPref(on);
    try { localStorage.setItem("mp-count-blind", on ? "1" : "0"); } catch { /* storage unavailable */ }
  };

  const load = useCallback(() => {
    api<CountDetail>(`/api/v1/stock-counts/${id}`).then((c) => { setCount(c); setKept(new Set()); if (c.status !== "OPEN") setFilterRaw("all"); }).catch((e) => push(e.message, "error"));
  }, [id, push]);
  useEffect(load, [load]);

  const open = count?.status === "OPEN";
  const editable = open && canEdit;
  const blind = !!open && blindPref;

  const setLine = (itemId: string, patch: Partial<Line>) =>
    setCount((c) => (c ? { ...c, lines: c.lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) } : c));

  async function save(itemId: string, countedQty: number | null, imeis?: string[]) {
    const before = count?.lines.find((l) => l.itemId === itemId);
    setKept((k) => (k.has(itemId) ? k : new Set(k).add(itemId)));
    // Back to "not counted" also drops its reason (the server does the same).
    setLine(itemId, { countedQty, ...(imeis ? { countedImeis: imeis } : {}), ...(countedQty === null ? { reason: null } : {}) });
    try {
      await api(`/api/v1/stock-counts/${id}`, { method: "PATCH", body: { entries: [{ itemId, countedQty, imeis }] } });
    } catch (e) {
      push((e as Error).message, "error");
      if (before) setLine(itemId, { countedQty: before.countedQty, countedImeis: before.countedImeis, reason: before.reason });
    }
  }

  /** What explains a difference — a reason from the list, a short remark — saved on its own, the
   *  figure counted untouched. */
  async function saveWhy(itemId: string, patch: { reason?: string | null; note?: string | null }) {
    const line = count?.lines.find((l) => l.itemId === itemId);
    const before = { reason: line?.reason ?? null, note: line?.note ?? null };
    setLine(itemId, patch);
    try {
      await api(`/api/v1/stock-counts/${id}`, { method: "PATCH", body: { entries: [{ itemId, ...patch }] } });
    } catch (e) {
      push((e as Error).message, "error");
      setLine(itemId, before);
    }
  }

  /** Enter (or the arrow keys) in a count cell moves to the next or previous row's cell, as in a
   *  spreadsheet, so a long list is counted down with the keyboard alone. */
  const listRef = useRef<HTMLDivElement>(null);
  function moveFrom(el: HTMLElement, by: 1 | -1) {
    const cells = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-count-cell]") ?? [])];
    const next = cells[cells.indexOf(el) + by];
    next?.focus();
  }

  // "/" jumps to the scan / search box, as in the spreadsheet-style tools shop owners know.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  /** A read from a scanner gun or the typed box answers with a sound (the camera makes its own on
   *  every read), so a counter looking at the shelf hears whether it counted without looking at the screen. */
  function scanSound(r: ScanResult) {
    if (r === "counted") playBeep();
    else if (r === "dup" || r === "none") playError();
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

  async function act(kind: "finish" | "zero" | "cancel", remarks?: string) {
    setBusy(true);
    try {
      if (kind === "zero") {
        const r = await api<{ marked: number }>(`/api/v1/stock-counts/${id}/zero`, { method: "POST" });
        push(`${r.marked} item(s) set to 0`);
        load();
      } else {
        await api(`/api/v1/stock-counts/${id}/${kind === "finish" ? "complete" : "cancel"}`, { method: "POST", body: kind === "finish" && remarks ? { remarks } : undefined });
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

  // While counting blind, how the count compares with the books is not shown, so the lists that
  // are about that (Short, Over, Matches) are not offered either.
  const activeFilter: Filter = blind && (filter === "short" || filter === "over" || filter === "ok") ? "all" : filter;

  // The shelves (categories) in this count, so a big one can be taken a shelf at a time.
  const cats = [...new Set(lines.map((l) => l.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const shown = lines.filter((l) => {
    const d = diffOf(l);
    if (cat && l.category !== cat) return false;
    if (kept.has(l.itemId)) return matchesWords(q, l.name, l.sku, l.barcode, l.category);
    if (activeFilter === "todo" && l.countedQty !== null) return false;
    if (activeFilter === "short" && !(d !== null && d < 0)) return false;
    if (activeFilter === "over" && !(d !== null && d > 0)) return false;
    if (activeFilter === "ok" && d !== 0) return false;
    return matchesWords(q, l.name, l.sku, l.barcode, l.category);
  });

  const filters: [Filter, string, number][] = [
    ...(open ? [["todo", "Not counted", todo] as [Filter, string, number]] : []),
    ...(blind ? [] : [
      ["short", "Short", shortLines.length] as [Filter, string, number],
      ["over", "Over", overLines.length] as [Filter, string, number],
      ["ok", "Matches", counted.length - shortLines.length - overLines.length] as [Filter, string, number],
    ]),
    ["all", "All", lines.length],
  ];

  // What finishing would change, item by item, for the review before the stock is corrected.
  const variances = counted.filter((l) => (diffOf(l) ?? 0) !== 0);

  /** The whole count as a spreadsheet: every item, what the books held, what was counted, the
   *  difference and its worth, the reason and the remark — for Excel, an accountant, or a file. */
  function exportCsv() {
    if (!count) return;
    const head = ["SKU", "Item", "Category", "Books", "Counted", "Difference", ...(seeCost ? ["Unit cost", "Difference value"] : []), "Reason", "Remark"];
    const rows = lines.map((l) => {
      const d = diffOf(l);
      return [
        l.sku, l.name, l.category, l.expectedQty, l.countedQty ?? "", d ?? "",
        ...(seeCost ? [Number(l.unitCost) / 100, d === null ? "" : Number(BigInt(l.unitCost) * BigInt(d)) / 100] : []),
        d ? countReasonLabel(l.reason) ?? "" : "", d ? l.note ?? "" : "",
      ];
    });
    downloadCsv(`${count.txnNo}-${count.branch}`.replace(/[^\w.-]+/g, "_"), rowsToCsv([head, ...rows]));
  }

  /** Finishing ends a blind count: the figures come back for the review, which is the point of it. */
  function askFinish() {
    if (blindPref) setBlind(false);
    setConfirm("finish");
  }

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
    // Text that is just a search (it still finds items) makes no sound; only a read does.
    if (r !== "none" || shown.length === 0) scanSound(r);
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-2 pb-20 lg:pb-0">
      {/* Only on paper: what this report is, since the screen's own header is not printed. */}
      <div className="hidden space-y-1 border-b border-gray-300 pb-3 print:block">
        <div className="text-lg font-bold">Stock count report</div>
        <div className="text-sm">{me?.business?.name} · {count.txnNo} · {count.branch} · {count.categoryName || "All items"}</div>
        {count.completedAt && <div className="text-xs text-gray-600">{dateTime(count.completedAt)}</div>}
        <div className="text-sm">
          <span>Counted</span> {counted.length} / {lines.length} · <span>Short</span> {shortQty}{seeCost && shortValue > 0n ? ` (${fmtMoney(shortValue, cur)})` : ""} · <span>Over</span> {overQty}{seeCost && overValue > 0n ? ` (${fmtMoney(overValue, cur)})` : ""}
        </div>
        {count.notes && <div className="text-xs text-gray-600">{count.notes}</div>}
      </div>

      {/* Stays in view while the list scrolls: where this count is, the way to finish it, and the
          column heads, as a spreadsheet keeps its top row. */}
      <div className="no-print sticky top-0 z-20 -mx-3 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:-mx-4">
        <div className="space-y-1 px-3 pt-1.5 sm:px-4">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" aria-label="Back" onClick={onBack}><ArrowLeft size={18} /></Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-sm font-semibold">{count.txnNo}</span>
                <Badge status={count.status} />
              </div>
              <div className="truncate text-[11px] text-gray-500">{count.branch} · {count.categoryName || "All items"}</div>
            </div>
            <Button size="sm" variant="ghost" aria-label="Export to a spreadsheet" title="Export to a spreadsheet (CSV)" onClick={exportCsv}><Download size={17} /></Button>
            {count.status === "COMPLETED" && <Button size="sm" variant="ghost" aria-label="Print the report" title="Print the report" onClick={() => window.print()}><Printer size={17} /></Button>}
            {editable && canFinish && (
              // A short word here (the bar is narrow); the review that follows spells out what finishing does.
              <Button size="sm" className="shrink-0" disabled={busy || counted.length === 0} onClick={askFinish}><Check size={15} className="mr-1 inline" />Finish</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full bg-blue-600 transition-all" style={{ width: `${lines.length ? Math.round((counted.length / lines.length) * 100) : 0}%` }} /></div>
            <span className="text-[11px] tabular-nums text-gray-500">{counted.length} / {lines.length}</span>
          </div>
        </div>
        <div className={cn(GRID, "mt-1 border-t border-gray-100 bg-gray-50 px-[13px] py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 sm:px-[29px]")}>
          <div>Item</div><div className="text-right">Books</div><div className="text-right">Counted</div><div className="text-right">±</div>
        </div>
      </div>

      {count.status === "COMPLETED" && (
        <p className="no-print rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-800 dark:bg-green-950/40 dark:text-green-300">This count is finished. The stock was corrected to what was counted.</p>
      )}
      {count.status === "CANCELLED" && (
        <p className="no-print rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">This count was cancelled. No stock changed.</p>
      )}

      <form className="no-print flex gap-2" onSubmit={submit}>
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="done"
            placeholder={editable ? "Scan, or search name, SKU or IMEI" : "Search name, SKU or barcode…"}
            className="h-9 w-full rounded-md border border-gray-300 bg-white pl-8 pr-8 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800/80 sm:text-sm"
          />
          {q && (
            <button type="button" aria-label="Clear" className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setQ(""); inputRef.current?.focus(); }}>
              <X size={15} />
            </button>
          )}
        </div>
        {editable && canCamera && (
          <Button type="button" variant="secondary" aria-label="Scan with the camera" className="px-3" onClick={() => setCamera(true)}>
            <Camera size={18} />
          </Button>
        )}
      </form>

      <div className="no-print -mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {filters.map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={cn("shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium", activeFilter === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>
            <span>{label}</span> <span className="tabular-nums">{n}</span>
          </button>
        ))}
        {cats.length > 1 && <span className="mx-1 shrink-0 self-stretch border-l border-gray-200 dark:border-gray-700" />}
        {cats.length > 1 && ["", ...cats].map((c) => (
          <button key={c || "all"} type="button" onClick={() => setCat(c)} className={cn("max-w-[12rem] shrink-0 truncate whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium", cat === c ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300")}>
            {c || "All items"}
          </button>
        ))}
      </div>

      {editable && (
        <div className="no-print flex items-center justify-between gap-3">
          <p className="min-w-0 text-[11px] leading-snug text-gray-500">{blind ? "Type how many you found, then Enter. 0 = not found." : "Type how many you found, then Enter. ✓ = all there, 0 = not found."}</p>
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
            <EyeOff size={14} /><span>Blind count</span>
            <Switch on={blindPref} onChange={setBlind} label="Blind count" />
          </label>
        </div>
      )}
      {blind && <p className="no-print rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Blind count is on: the books figures are hidden until you finish.</p>}

      {!blind && (shortQty > 0 || overQty > 0) && (
        <p className="no-print flex flex-wrap gap-x-4 text-xs">
          {shortQty > 0 && <span className="text-red-600"><span>Short</span> <span className="tabular-nums font-medium">{shortQty}</span>{seeCost && shortValue > 0n && <span className="tabular-nums"> ({fmtMoney(shortValue, cur)})</span>}</span>}
          {overQty > 0 && <span className="text-green-700 dark:text-green-400"><span>Over</span> <span className="tabular-nums font-medium">{overQty}</span>{seeCost && overValue > 0n && <span className="tabular-nums"> ({fmtMoney(overValue, cur)})</span>}</span>}
        </p>
      )}

      {shown.length === 0 ? (
        <Card><Empty message={activeFilter === "todo" && !q && !cat ? "Every item is counted" : "Nothing here"} /></Card>
      ) : (
        <div ref={listRef} className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {shown.map((l) => <CountLine key={l.itemId} line={l} editable={editable} blind={blind} onSave={save} onWhy={saveWhy} onImei={() => setImeiFor(l)} onMove={moveFrom} />)}
        </div>
      )}

      {editable && (
        <div className="no-print flex flex-wrap gap-2">
          {canFinish && <Button disabled={busy || counted.length === 0} onClick={askFinish}><Check size={16} className="mr-1 inline" />Finish count</Button>}
          {todo > 0 && <Button variant="secondary" disabled={busy} onClick={() => setConfirm("zero")}>Mark the rest as not found</Button>}
          {canFinish && <Button variant="ghost" className="ml-auto text-red-600" disabled={busy} onClick={() => setConfirm("cancel")}><X size={16} className="mr-1 inline" />Cancel count</Button>}
        </div>
      )}

      <BarcodeScannerModal open={camera} onClose={closeCamera} onScan={onCameraScan} title="Scan with the camera" />

      {imeiFor && (
        <ImeiCountModal
          line={count.lines.find((l) => l.itemId === imeiFor.itemId) ?? imeiFor}
          editable={!!editable}
          blind={blind}
          onClose={() => setImeiFor(null)}
          onSave={(imeis) => { save(imeiFor.itemId, imeis.length, imeis); setImeiFor(null); }}
        />
      )}

      {/* The review before the books are changed: each item that differs, the reason given, and what
          it is worth, so nothing is corrected without being seen. */}
      <Modal
        open={confirm === "finish"}
        onClose={() => setConfirm(null)}
        title="Review before correcting the stock"
        wide
        footer={<div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button disabled={busy} onClick={() => { setConfirm(null); act("finish", remarks.trim()); }}>Correct the stock</Button>
        </div>}
      >
        <div className="space-y-3 text-sm">
          <p className="text-gray-600 dark:text-gray-300">The stock of every counted item becomes what was counted. This cannot be undone.</p>
          {variances.length === 0 ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-green-800 dark:bg-green-950/40 dark:text-green-300">Nothing will change: every counted item matches the books.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {variances.map((l) => {
                const d = diffOf(l) ?? 0;
                const why = countReasonLabel(l.reason);
                return (
                  <li key={l.itemId} className="space-y-0.5 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-medium">{l.name}</span>
                      <span className={cn("shrink-0 font-bold tabular-nums", d < 0 ? "text-red-600" : "text-green-700 dark:text-green-400")}>{d > 0 ? `+${d}` : d}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span><span>Books</span> <b className="tabular-nums text-gray-700 dark:text-gray-200">{l.expectedQty}</b> → <span>Counted</span> <b className="tabular-nums text-gray-700 dark:text-gray-200">{l.countedQty}</b></span>
                      {seeCost && <span className="tabular-nums">{fmtMoney(BigInt(l.unitCost) * BigInt(d), cur)}</span>}
                      {why ? <span className="text-gray-600 dark:text-gray-300">{why}</span> : <span className="text-amber-600">No reason given</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="space-y-1">
            <li className="text-red-600"><span>Short</span> <span className="tabular-nums font-medium">{shortQty}</span>{seeCost && shortValue > 0n && <span className="tabular-nums"> ({fmtMoney(shortValue, cur)})</span>}</li>
            <li className="text-green-700 dark:text-green-400"><span>Over</span> <span className="tabular-nums font-medium">{overQty}</span>{seeCost && overValue > 0n && <span className="tabular-nums"> ({fmtMoney(overValue, cur)})</span>}</li>
            {todo > 0 && <li className="text-amber-600"><span>Not counted (left as they are)</span> <span className="tabular-nums font-medium">{todo}</span></li>}
          </ul>
          <Input label="Remarks (optional)" value={remarks} maxLength={300} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </Modal>
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

/** The columns of the counting sheet — item, books, counted, difference — shared by the heading
 *  row and every item row so they line up like a spreadsheet's. */
const GRID = "grid grid-cols-[minmax(5rem,1fr)_2.75rem_5.25rem_2.75rem] items-center gap-x-2";

/** One item as one line of the sheet. The number found is typed straight into its cell and Enter
 *  moves down to the next, as in Excel; "all there" is a single small tick, and 0 means not found.
 *  A line that differs from the books opens a second line for its reason and a short remark. */
function CountLine({ line, editable, blind, onSave, onWhy, onImei, onMove }: {
  line: Line; editable: boolean; blind: boolean;
  onSave: (itemId: string, qty: number | null) => void;
  onWhy: (itemId: string, patch: { reason?: string | null; note?: string | null }) => void;
  onImei: () => void; onMove: (el: HTMLElement, by: 1 | -1) => void;
}) {
  const [text, setText] = useState(line.countedQty === null ? "" : String(line.countedQty));
  // A scan, "all there" or a count made elsewhere changes the figure from outside the cell: show it.
  const [shownQty, setShownQty] = useState(line.countedQty);
  if (shownQty !== line.countedQty) {
    setShownQty(line.countedQty);
    setText(line.countedQty === null ? "" : String(line.countedQty));
  }
  const [remark, setRemark] = useState(line.note ?? "");
  const d = diffOf(line);
  const untouched = line.countedQty === null;
  const differs = d !== null && d !== 0;

  function commit() {
    const v = text.trim();
    const qty = v === "" ? null : Number(v);
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) { setText(line.countedQty === null ? "" : String(line.countedQty)); return; }
    if (qty !== line.countedQty) onSave(line.itemId, qty);
  }

  /** The difference column: a tick when it matches, a signed number when it does not; while counting
   *  blind only that it was counted. */
  const result = d === null ? null : blind || d === 0
    ? <span className="text-gray-400">✓</span>
    : <span className={cn("font-bold", d < 0 ? "text-red-600" : "text-green-700 dark:text-green-400")}>{d > 0 ? `+${d}` : d}</span>;

  return (
    <div className={cn("border-b border-gray-100 px-3 py-1 last:border-b-0 dark:border-gray-800", !blind && d !== null && d < 0 && "bg-red-50/60 dark:bg-red-950/20", !blind && d !== null && d > 0 && "bg-green-50/60 dark:bg-green-950/20")}>
      <div className={cn(GRID, "min-h-[2.75rem]")}>
        <div className="min-w-0">
          {/* Two lines allowed: names differ at the end (128GB Black, 256GB Blue), so cutting them off hides which one it is. */}
          <div className="line-clamp-2 break-words text-[13px] font-medium leading-tight">{line.name}</div>
          <div className="truncate text-[11px] leading-tight text-gray-500">{[line.sku, line.category].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right text-sm tabular-nums text-gray-600 dark:text-gray-300">{blind ? "•••" : line.expectedQty}</div>
        <div className="flex items-center justify-end gap-1">
          {/* "All there" copies the books figure, which a blind count must not do. Not part of the tab order. */}
          {editable && !blind && !line.trackSerial && untouched && (
            <button type="button" tabIndex={-1} aria-label="All there" title="All there" onClick={() => onSave(line.itemId, line.expectedQty)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/40">
              <Check size={16} />
            </button>
          )}
          {line.trackSerial ? (
            <button type="button" onClick={onImei} title="Tick IMEIs" className="h-8 w-14 rounded border border-blue-400 px-1.5 text-right text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {line.countedQty ?? "?"}<span className="ml-0.5 text-[10px] font-normal">▸</span>
            </button>
          ) : editable ? (
            <input
              data-count-cell
              inputMode="numeric"
              aria-label="Counted"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commit}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); commit(); onMove(el, 1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); commit(); onMove(el, -1); }
              }}
              placeholder="?"
              className="h-8 w-14 rounded border border-gray-300 bg-white px-1.5 text-right text-sm font-semibold tabular-nums outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
          ) : (
            <span className="text-sm font-semibold tabular-nums">{line.countedQty ?? "—"}</span>
          )}
        </div>
        <div className="text-right text-sm tabular-nums">{result}</div>
      </div>

      {/* Why it differs: optional, a short list and a few words, carried into the stock movement. */}
      {!blind && differs && editable && (
        <div className="flex gap-1.5 pb-1 pt-0.5">
          <select
            aria-label="Reason"
            value={line.reason ?? ""}
            onChange={(e) => onWhy(line.itemId, { reason: e.target.value || null })}
            className="h-8 w-44 shrink-0 rounded border border-gray-300 bg-white px-1.5 text-xs text-gray-700 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">Reason (optional)</option>
            {COUNT_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <input
            aria-label="Remark"
            value={remark}
            maxLength={200}
            placeholder="Remark…"
            onChange={(e) => setRemark(e.target.value)}
            onBlur={() => { if (remark.trim() !== (line.note ?? "")) onWhy(line.itemId, { note: remark.trim() || null }); }}
            className="h-8 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 text-xs outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      )}
      {!editable && differs && (countReasonLabel(line.reason) || line.note) && (
        <div className="pb-1 text-[11px] text-gray-500">{[countReasonLabel(line.reason), line.note].filter(Boolean).join(" — ")}</div>
      )}
    </div>
  );
}

/** An IMEI phone is counted phone by phone: tick each one the books hold that is on the
 *  shelf, and add any found that the books do not have. */
function ImeiCountModal({ line, editable, blind, onClose, onSave }: { line: Line; editable: boolean; blind: boolean; onClose: () => void; onSave: (imeis: string[]) => void }) {
  const [found, setFound] = useState<string[]>(line.countedImeis);
  const [extra, setExtra] = useState("");
  // A blind count does not list the phones the books hold (that would be the answer): only what has
  // been found so far, which grows as each IMEI is entered.
  const all = [...new Set([...(blind ? [] : line.expectedImeis), ...found])];
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
        <p className="text-sm text-gray-500">{blind ? "Enter the IMEI of each phone you find on the shelf." : "Tick each phone that is on the shelf. A phone not ticked is short."}</p>
        {all.length === 0 ? <Empty message={blind ? "No phones entered yet" : "No IMEIs in the books"} /> : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
            {all.map((i) => {
              const inBooks = line.expectedImeis.includes(i);
              return (
                <li key={i}>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" disabled={!editable} checked={found.includes(i)} onChange={() => toggle(i)} />
                    <span className="font-mono tabular-nums">{i}</span>
                    {!blind && !inBooks && <span className="ml-auto rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">Not in books</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {editable && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); addExtra(); }}>
            <div className="flex-1"><Input label={blind ? "IMEI of a phone you found" : "Found a phone not in the list? Its IMEI"} value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
            <Button type="submit" variant="secondary">Add</Button>
          </form>
        )}
        <p className="text-sm"><span className="text-gray-500">Counted</span> <span className="font-semibold tabular-nums">{found.length}</span>{!blind && <> <span className="text-gray-500">/</span> <span className="tabular-nums">{line.expectedQty}</span></>}</p>
      </div>
    </Modal>
  );
}

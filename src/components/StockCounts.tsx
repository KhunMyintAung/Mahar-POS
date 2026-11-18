"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ClipboardCheck, Plus, ScanLine, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { normalizeImei } from "@/lib/imeiInput";
import { matchesWords } from "@/lib/searchWords";
import { Badge, Button, Card, ConfirmDialog, Empty, Input, Modal, ProgressBar, Select, Spinner, cn, useToast } from "@/components/ui";
import { useAuth, useCurrency } from "@/components/AppShell";

/** Stock count (stocktake): the books are the list, and each line is looked for on the shelf.
 *  An item in the books but not on the shelf stays "Not counted" until someone finds it or
 *  marks it 0, so nothing missing slips by. Finishing it corrects the stock to what was found. */

interface CountRow {
  id: string; txnNo: string; status: string; branch: string; categoryName?: string | null; notes?: string | null;
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

  return (
    <div className="space-y-3">
      <Card className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardCheck size={18} className="text-blue-600" />
          <span className="font-semibold">Stock count</span>
          {canStart && (
            <Button className="ml-auto" onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New stock count</Button>
          )}
        </div>
        <p className="text-sm text-gray-500">The list comes from the books. Find each item on the shelf and enter how many there are. Items you cannot find stay as not counted, so nothing missing is overlooked.</p>
      </Card>

      {rows === null ? <Spinner /> : rows.length === 0 ? <Card><Empty message="No stock counts yet" /></Card> : (
        <div className="space-y-2">
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="block w-full text-left">
              <Card className={cn("space-y-2 transition hover:border-blue-400", c.status === "CANCELLED" && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.txnNo}</span>
                  <Badge status={c.status} />
                  <span className="text-sm text-gray-500">{c.branch}</span>
                  <span className="text-sm text-gray-500">·</span>
                  <span className="text-sm text-gray-500">{c.categoryName || "All items"}</span>
                  <span className="ml-auto text-xs tabular-nums text-gray-400">{dateTime(c.createdAt)}</span>
                </div>
                {c.status === "OPEN" ? (
                  <ProgressBar value={c.items ? c.counted / c.items : 0} label={<span className="tabular-nums">{c.counted} / {c.items}</span>} />
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
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); onOpen(id); }}
        />
      )}
    </div>
  );
}

function NewCountModal({ branches, defaultBranchId, onClose, onCreated }: {
  branches: { id: string; name: string }[]; defaultBranchId: string; onClose: () => void; onCreated: (id: string) => void;
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
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !branchId} onClick={start}>Start count</Button></div>}
    >
      <div className="space-y-3">
        {branches.length > 1 && (
          <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
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

const diffOf = (l: Line) => (l.countedQty === null ? null : l.adjustment ?? l.countedQty - l.expectedQty);

function CountSheet({ id, onBack }: { id: string; onBack: () => void }) {
  const cur = useCurrency();
  const { hasPerm } = useAuth();
  const { push } = useToast();
  const canEdit = hasPerm("stock.adjust");
  const canFinish = hasPerm("stock.adjust") && hasPerm("item.manage");
  const seeCost = hasPerm("report.view") || hasPerm("item.manage");
  const [count, setCount] = useState<CountDetail | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [q, setQ] = useState("");
  const [scan, setScan] = useState("");
  const [imeiFor, setImeiFor] = useState<Line | null>(null);
  const [confirm, setConfirm] = useState<"finish" | "zero" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<CountDetail>(`/api/v1/stock-counts/${id}`).then((c) => { setCount(c); if (c.status !== "OPEN") setFilter("all"); }).catch((e) => push(e.message, "error"));
  }, [id, push]);
  useEffect(load, [load]);

  const open = count?.status === "OPEN";
  const editable = open && canEdit;

  const setLine = (itemId: string, patch: Partial<Line>) =>
    setCount((c) => (c ? { ...c, lines: c.lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) } : c));

  async function save(itemId: string, countedQty: number | null, imeis?: string[]) {
    const before = count?.lines.find((l) => l.itemId === itemId);
    setLine(itemId, { countedQty, ...(imeis ? { countedImeis: imeis } : {}) });
    try {
      await api(`/api/v1/stock-counts/${id}`, { method: "PATCH", body: { entries: [{ itemId, countedQty, imeis }] } });
    } catch (e) {
      push((e as Error).message, "error");
      if (before) setLine(itemId, { countedQty: before.countedQty, countedImeis: before.countedImeis });
    }
  }

  /** A scanned barcode adds one of that item; a scanned IMEI ticks that phone. */
  function onScan(raw: string) {
    const code = raw.trim();
    if (!count || !code) return;
    const imei = normalizeImei(code);
    const phone = count.lines.find((l) => l.trackSerial && l.expectedImeis.includes(imei));
    if (phone) {
      if (phone.countedImeis.includes(imei)) push(`IMEI ${imei} — already counted`, "error");
      else { save(phone.itemId, phone.countedImeis.length + 1, [...phone.countedImeis, imei]); push(`${phone.name} ✓`); }
      setScan("");
      return;
    }
    const item = count.lines.find((l) => l.barcode === code || l.sku.toLowerCase() === code.toLowerCase());
    if (item && !item.trackSerial) {
      save(item.itemId, (item.countedQty ?? 0) + 1);
      push(`${item.name} ✓`);
      setScan("");
      return;
    }
    if (item?.trackSerial) { setImeiFor(item); setScan(""); return; }
    push(`${code} — not in this count`, "error");
  }

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

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" aria-label="Back" onClick={onBack}><ArrowLeft size={16} /></Button>
          <span className="font-semibold">{count.txnNo}</span>
          <Badge status={count.status} />
          <span className="text-sm text-gray-500">{count.branch}</span>
          <span className="text-sm text-gray-500">·</span>
          <span className="text-sm text-gray-500">{count.categoryName || "All items"}</span>
        </div>
        <ProgressBar value={lines.length ? counted.length / lines.length : 0} label={<span className="tabular-nums">{counted.length} / {lines.length}</span>} />
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/40">
            <div className="text-xs text-gray-500">Not counted</div>
            <div className="text-lg font-semibold tabular-nums">{todo}</div>
          </div>
          <div className="rounded-lg bg-red-50 p-2 dark:bg-red-950/40">
            <div className="text-xs text-gray-500">Short</div>
            <div className="text-lg font-semibold tabular-nums text-red-600">{shortQty}</div>
            {seeCost && shortValue > 0n && <div className="text-xs tabular-nums text-red-600">{fmtMoney(shortValue, cur)}</div>}
          </div>
          <div className="rounded-lg bg-green-50 p-2 dark:bg-green-950/40">
            <div className="text-xs text-gray-500">Over</div>
            <div className="text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">{overQty}</div>
            {seeCost && overValue > 0n && <div className="text-xs tabular-nums text-green-700 dark:text-green-400">{fmtMoney(overValue, cur)}</div>}
          </div>
        </div>
        {editable && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); onScan(scan); scanRef.current?.focus(); }}>
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Scan barcode or IMEI</span>
              <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan, or type and press Enter" className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800/80 sm:min-h-10 sm:text-sm" />
            </label>
            <Button type="submit" variant="secondary" aria-label="Add"><ScanLine size={16} /></Button>
          </form>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {filters.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium", filter === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>
              <span>{label}</span> <span className="tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <input placeholder="Search name, SKU or barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
      </div>

      {shown.length === 0 ? (
        <Card><Empty message={filter === "todo" && !q ? "Every item is counted" : "Nothing here"} /></Card>
      ) : (
        <Card className="divide-y divide-gray-100 p-0 dark:divide-gray-800">
          {shown.map((l) => <CountLine key={l.itemId} line={l} editable={editable} seeCost={seeCost} cur={cur} onSave={save} onImei={() => setImeiFor(l)} />)}
        </Card>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2">
          {canFinish && <Button disabled={busy || counted.length === 0} onClick={() => setConfirm("finish")}><Check size={16} className="mr-1 inline" />Finish count</Button>}
          {todo > 0 && <Button variant="secondary" disabled={busy} onClick={() => setConfirm("zero")}>Set not counted to 0</Button>}
          {canFinish && <Button variant="ghost" className="ml-auto text-red-600" disabled={busy} onClick={() => setConfirm("cancel")}><X size={16} className="mr-1 inline" />Cancel count</Button>}
        </div>
      )}

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
        title="Set not counted to 0"
        confirmLabel="Set to 0"
        danger
        message={<p>Every item not counted yet is marked as not found (0). Do this only after looking for all of them.</p>}
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

  function commit() {
    const v = text.trim();
    const qty = v === "" ? null : Number(v);
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) { setText(line.countedQty === null ? "" : String(line.countedQty)); return; }
    if (qty !== line.countedQty) onSave(line.itemId, qty);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <div className="truncate font-medium">{line.name}</div>
        <div className="truncate text-xs text-gray-500">{[line.sku, line.category].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="text-center">
        <div className="text-[10px] uppercase text-gray-400">Books</div>
        <div className="tabular-nums">{line.expectedQty}</div>
      </div>
      <div className="w-24 text-center">
        <div className="text-[10px] uppercase text-gray-400">Counted</div>
        {line.trackSerial ? (
          <Button size="sm" variant="secondary" onClick={onImei}><span className="tabular-nums">{line.countedQty ?? "—"}</span> <span>IMEI</span></Button>
        ) : editable ? (
          <div className="flex items-center gap-1">
            <input
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="—"
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-center text-base tabular-nums outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:text-sm"
            />
          </div>
        ) : (
          <div className="tabular-nums">{line.countedQty ?? "—"}</div>
        )}
      </div>
      <div className="w-20 text-right">
        <div className="text-[10px] uppercase text-gray-400">Difference</div>
        {d === null ? (
          <div className="text-xs text-amber-600">Not counted</div>
        ) : (
          <div className={cn("font-semibold tabular-nums", d < 0 ? "text-red-600" : d > 0 ? "text-green-700 dark:text-green-400" : "text-gray-400")}>
            {d > 0 ? `+${d}` : d}
          </div>
        )}
        {seeCost && d !== null && d !== 0 && <div className="text-[11px] tabular-nums text-gray-500">{fmtMoney(BigInt(line.unitCost) * BigInt(d), cur)}</div>}
      </div>
      {editable && !line.trackSerial && line.countedQty === null && (
        <Button size="sm" variant="ghost" className="text-gray-500" onClick={() => onSave(line.itemId, 0)}>Not found</Button>
      )}
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

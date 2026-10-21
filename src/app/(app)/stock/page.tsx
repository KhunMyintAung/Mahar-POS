"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Modal, Select, Spinner, Table, Empty, cn, useToast } from "@/components/ui";
import { Paginated } from "@/components/Pager";
import { ImeiAdjustFields, ImeiListModal, ImeiSearch } from "@/components/ImeiTools";
import { useAuth } from "@/components/AppShell";
import { MOVEMENT_LABELS, STOCK_REASONS, type StockReason } from "@/lib/stockReasons";

/** Today and this month in the shop's own time zone, for the period picker. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
/** Moves a day ("YYYY-MM-DD") or a month ("YYYY-MM") back or forward. */
function shiftPeriod(value: string, step: number): string {
  if (value.length === 7) {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + step, 1));
    return d.toISOString().slice(0, 7);
  }
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + step);
  return d.toISOString().slice(0, 10);
}

interface RepairJobOption {
  id: string; jobNo: string; status: string; deviceBrand: string; deviceModel: string; customerName?: string;
}

interface Level {
  itemId: string; name: string; sku: string; unit?: string; category?: string;
  minStock: number; costPrice: string; sellingPrice: string; totalQty: number; low: boolean;
  byBranch: { branchId: string; quantity: number }[];
  /** IMEI-tracked phone, and how many of its units on the shelf have an IMEI recorded. */
  trackSerial?: boolean; imeiInStock?: number;
}
interface Movement {
  id: string; type: string; quantity: number; qtyAfter: number; notes?: string;
  createdAt: string; item: { name: string; sku: string };
}

export default function StockPage() {
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [tab, setTab] = useState<"levels" | "movements">("levels");
  const [adjustTarget, setAdjustTarget] = useState<Level | null>(null);
  const blankAdjust = { quantity: "", reason: "", reasonType: "REPAIR_USE" as StockReason, repairJobId: "" };
  const [adjust, setAdjust] = useState(blankAdjust);
  // A tracked phone moves by IMEI: the units picked or typed, and for a +/− correction which way.
  const [adjustImeis, setAdjustImeis] = useState<string[]>([]);
  const [adjustWay, setAdjustWay] = useState<"in" | "out">("out");
  const [imeiTarget, setImeiTarget] = useState<Level | null>(null);
  const [openJobs, setOpenJobs] = useState<RepairJobOption[]>([]);
  const [moveType, setMoveType] = useState("ALL");
  // Movements are looked at a day or a month at a time.
  const [periodKind, setPeriodKind] = useState<"day" | "month">("day");
  const [period, setPeriod] = useState(today);
  const [adjustBranchId, setAdjustBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("ALL");
  const [q, setQ] = useState("");
  const { push } = useToast();
  const { hasPerm, branches, defaultBranchId, featureEnabled } = useAuth();
  const canLinkRepairs = featureEnabled("repair") && hasPerm("repair.view");

  // Jobs a part can still go into: anything not yet handed back or cancelled.
  useEffect(() => {
    if (!adjustTarget || !canLinkRepairs) return;
    api<{ jobs: RepairJobOption[] }>("/api/v1/repairs?pageSize=200")
      .then((d) => setOpenJobs(d.jobs.filter((j) => j.status !== "DELIVERED" && j.status !== "CANCELLED")))
      .catch(() => {});
  }, [adjustTarget, canLinkRepairs]);

  const load = useCallback(() => {
    api<Level[]>("/api/v1/stock").then(setLevels).catch((e) => push(e.message, "error"));
    api<Movement[]>(`/api/v1/stock?movements=1&${period.length === 7 ? "month" : "date"}=${period}`).then(setMovements).catch(() => {});
  }, [push, period]);
  useEffect(load, [load]);

  // The cards over the movement list: what came in, what went out, and the two outs a
  // phone shop watches, sales and parts used in repairs.
  const totals = useMemo(() => {
    let stockIn = 0, stockOut = 0, sold = 0, repair = 0;
    for (const m of movements) {
      if (m.quantity > 0) stockIn += m.quantity; else stockOut -= m.quantity;
      if (m.type === "SALE") sold -= m.quantity;
      if (m.type === "SALE_RETURN") sold -= m.quantity;
      if (m.type === "REPAIR_USE") repair -= m.quantity;
    }
    return { stockIn, stockOut, sold, repair };
  }, [movements]);

  function choosePeriodKind(kind: "day" | "month") {
    setPeriodKind(kind);
    setMoveType("ALL");
    setPeriod(kind === "month" ? today().slice(0, 7) : today());
  }

  /** The signed quantity for a tracked phone: one per IMEI, in or out. */
  function imeiQuantity(): number {
    const direction = STOCK_REASONS.find((r) => r.key === adjust.reasonType)?.direction ?? "either";
    const way = direction === "either" ? adjustWay : direction;
    return way === "out" ? -adjustImeis.length : adjustImeis.length;
  }

  async function doAdjust() {
    if (!adjustTarget) return;
    setBusy(true);
    try {
      await api("/api/v1/stock", {
        method: "POST",
        body: {
          itemId: adjustTarget.itemId,
          branchId: adjustBranchId,
          quantity: adjustTarget.trackSerial ? imeiQuantity() : parseInt(adjust.quantity),
          imeis: adjustTarget.trackSerial ? adjustImeis : undefined,
          reasonType: adjust.reasonType,
          reason: adjust.reason.trim(),
          repairJobId: adjust.reasonType === "REPAIR_USE" && adjust.repairJobId ? adjust.repairJobId : undefined,
        },
      });
      push("Stock adjusted");
      setAdjustTarget(null); setAdjust(blankAdjust); setAdjustImeis([]);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!levels) return <Spinner />;
  const lowCount = levels.filter((l) => l.low).length;

  // Stock is read a shelf at a time — phones, glass, accessories, spare parts — so it is
  // grouped by category, and one category can be picked out on its own.
  const UNCATEGORISED = "—";
  const categoryOf = (l: Level) => l.category ?? UNCATEGORISED;
  const categories = [...new Set(levels.map(categoryOf))].sort((a, b) =>
    a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b)
  );
  const needle = q.trim().toLowerCase();
  const shown = levels.filter((l) =>
    (category === "ALL" || categoryOf(l) === category) &&
    (!needle || l.name.toLowerCase().includes(needle) || l.sku.toLowerCase().includes(needle))
  );
  const groupsOf = (rows: Level[]) => categories
    .map((c) => ({ name: c, rows: rows.filter((l) => categoryOf(l) === c) }))
    .filter((g) => g.rows.length > 0);
  const groups = groupsOf(shown);
  const movementsShown = movements.filter((m) => moveType === "ALL" || m.type === moveType);
  const valueOf = (rows: Level[]) => rows.reduce((sum, l) => sum + BigInt(l.costPrice) * BigInt(l.totalQty), 0n);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stock</h1>
        <div className="flex items-center gap-2">
          {lowCount > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">{lowCount} low stock</span>}
          {tab === "levels" && (
            <span className="text-sm text-gray-500">
              Value: <b className="tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(valueOf(shown).toString())}</b>
            </span>
          )}
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(["levels", "movements"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "levels" && levels.some((l) => l.trackSerial) && <ImeiSearch />}

      {tab === "levels" && levels.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {["ALL", ...categories].map((c) => {
              const rows = c === "ALL" ? levels : levels.filter((l) => categoryOf(l) === c);
              const low = rows.filter((l) => l.low).length;
              return (
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
                  {c === "ALL" ? "All" : c === UNCATEGORISED ? "No category" : c}
                  <span className={cn("rounded-full px-1.5 text-xs", category === c ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800")}>{rows.length}</span>
                  {low > 0 && <span className="h-2 w-2 rounded-full bg-red-500" title={`${low} low`} />}
                </button>
              );
            })}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or SKU"
            className="min-h-10 w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      )}

      {tab === "levels" ? (
        groups.length === 0 ? <Card><Empty message="No items" /></Card> : (
          <Paginated rows={shown} resetKey={[category, q]}>{(pageRows) => (
        <Table headers={["Item", "SKU", "Qty", "Min", "Stock value (cost)", ""]} rightAlign={[2, 3, 4]}>
            {/* Headings total the whole category, not just the rows on this page. */}
            {groupsOf(pageRows).map((g) => {
              const all = groups.find((x) => x.name === g.name)?.rows ?? g.rows;
              return [
              <tr key={`group-${g.name}`} className="bg-gray-50 dark:bg-gray-800/60">
                <td colSpan={2} className="px-3 py-2 text-sm font-semibold">
                  {g.name === UNCATEGORISED ? "No category" : g.name}
                  <span className="ml-2 text-xs font-normal text-gray-500">{all.length} item(s)</span>
                </td>
                <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">{all.reduce((n, l) => n + l.totalQty, 0)}</td>
                <td />
                <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">{fmtMoney(valueOf(all).toString())}</td>
                <td />
              </tr>,
              ...g.rows.map((l) => (
              <tr key={l.itemId} className={l.low ? "bg-red-50 dark:bg-red-900/10" : ""}>
                <td className="px-3 py-2.5 pl-6 font-medium">
                  {l.name}
                  {l.trackSerial && (
                    <span className={cn("ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", (l.imeiInStock ?? 0) < l.totalQty ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300")}>
                      IMEI {l.imeiInStock ?? 0}/{l.totalQty}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{l.sku}</td>
                <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", l.low && "text-red-600")}>
                  {l.totalQty} {l.unit ?? ""}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{l.minStock}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney((BigInt(l.costPrice) * BigInt(l.totalQty)).toString())}</td>
                <td className="px-3 py-2.5 text-right">
                  {l.trackSerial && (
                    <Button size="sm" variant="ghost" onClick={() => setImeiTarget(l)}>IMEIs</Button>
                  )}
                  {hasPerm("stock.adjust") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdjustImeis([]);
                        setAdjustWay("out");
                        // Spare parts mostly leave for repairs; anything else starts on a correction.
                        setAdjust({ ...blankAdjust, reasonType: /spare|part|lcd|battery|အပို/i.test(l.category ?? "") ? "REPAIR_USE" : "CORRECTION" });
                        setAdjustBranchId(defaultBranchId || branches[0]?.id || "");
                        setAdjustTarget(l);
                      }}
                    >
                      Adjust
                    </Button>
                  )}
                </td>
              </tr>
              )),
            ];
            })}
          </Table>
        )}</Paginated>
        )
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm dark:bg-gray-800">
            {(["day", "month"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => choosePeriodKind(k)}
                className={cn("rounded-md px-3 py-1 font-medium", periodKind === k ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}
              >
                {k === "day" ? "Day" : "Month"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Previous" onClick={() => { setMoveType("ALL"); setPeriod(shiftPeriod(period, -1)); }}><ChevronLeft size={16} /></Button>
            <input
              type={periodKind === "month" ? "month" : "date"}
              value={period}
              max={periodKind === "month" ? today().slice(0, 7) : today()}
              onChange={(e) => { if (e.target.value) { setMoveType("ALL"); setPeriod(e.target.value); } }}
              className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label="Next"
              disabled={period >= (periodKind === "month" ? today().slice(0, 7) : today())}
              onClick={() => { setMoveType("ALL"); setPeriod(shiftPeriod(period, 1)); }}
            >
              <ChevronRight size={16} />
            </Button>
            {period !== (periodKind === "month" ? today().slice(0, 7) : today()) && (
              <Button size="sm" variant="secondary" onClick={() => choosePeriodKind(periodKind)}>{periodKind === "month" ? "This month" : "Today"}</Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="space-y-1">
            <div className="text-xs text-gray-500">Stock in</div>
            <div className="text-xl font-bold tabular-nums text-green-600">+{totals.stockIn.toLocaleString()}</div>
          </Card>
          <Card className="space-y-1">
            <div className="text-xs text-gray-500">Stock out</div>
            <div className="text-xl font-bold tabular-nums text-red-600">−{totals.stockOut.toLocaleString()}</div>
          </Card>
          <Card className="space-y-1">
            <div className="text-xs text-gray-500">Sold</div>
            <div className="text-xl font-bold tabular-nums">{totals.sold.toLocaleString()}</div>
          </Card>
          <Card className="space-y-1">
            <div className="text-xs text-gray-500">Used in repairs</div>
            <div className="text-xl font-bold tabular-nums">{totals.repair.toLocaleString()}</div>
          </Card>
        </div>

        {movements.length === 0 ? <Card><Empty message={periodKind === "month" ? "No movements this month" : "No movements on this day"} /></Card> : <>
        {/* Filter by what happened: every part used in repairs, everything damaged… */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["ALL", ...[...new Set(movements.map((m) => m.type))]].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMoveType(t)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                moveType === t
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              )}
            >
              {t === "ALL" ? "All" : MOVEMENT_LABELS[t] ?? t.replace(/_/g, " ")}
              <span className={cn("rounded-full px-1.5 text-xs", moveType === t ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800")}>
                {t === "ALL" ? movements.length : movements.filter((m) => m.type === t).length}
              </span>
            </button>
          ))}
        </div>
        <Paginated rows={movementsShown} resetKey={[moveType, period]}>{(pageRows) => (
        <Table headers={["Date", "Item", "Type", "Qty", "After", "Notes"]} rightAlign={[3, 4]}>
          {pageRows.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(m.createdAt)}</td>
              <td className="px-3 py-2">{m.item.name}</td>
              <td className="px-3 py-2 text-xs">{MOVEMENT_LABELS[m.type] ?? m.type.replace(/_/g, " ")}</td>
              <td className={cn("px-3 py-2 text-right font-medium tabular-nums", m.quantity > 0 ? "text-green-600" : "text-red-600")}>
                {m.quantity > 0 ? "+" : ""}{m.quantity}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{m.qtyAfter}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{m.notes ?? ""}</td>
            </tr>
          ))}
        </Table>
        )}</Paginated>
        </>}
        </>
      )}

      {imeiTarget && (
        <ImeiListModal
          item={imeiTarget}
          branchId={defaultBranchId || branches[0]?.id || ""}
          stockQty={imeiTarget.byBranch.find((b) => b.branchId === (defaultBranchId || branches[0]?.id))?.quantity ?? 0}
          canAdjust={hasPerm("stock.adjust")}
          onClose={() => setImeiTarget(null)}
          onChanged={load}
        />
      )}

      <Modal open={!!adjustTarget} onClose={() => setAdjustTarget(null)} title={`Adjust ${adjustTarget?.name}`}>
        <div className="space-y-3">
          <Select label="Branch" value={adjustBranchId} onChange={(e) => setAdjustBranchId(e.target.value)}>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <p className="text-sm">
            Current quantity in this branch:{" "}
            <b>{adjustTarget?.byBranch.find((level) => level.branchId === adjustBranchId)?.quantity ?? 0}</b>
          </p>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">What happened</span>
            <div className="flex flex-wrap gap-1.5">
              {STOCK_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => { setAdjust({ ...adjust, reasonType: r.key }); setAdjustImeis([]); }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    adjust.reasonType === r.key
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200"
                  )}
                >
                  {/* Sign and label are separate nodes so the label can be translated. */}
                  <span className="mr-1">{r.direction === "out" ? "−" : r.direction === "in" ? "+" : "±"}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const reason = STOCK_REASONS.find((r) => r.key === adjust.reasonType)!;
            const qty = adjustTarget?.trackSerial ? imeiQuantity() : parseInt(adjust.quantity);
            const needsWords = reason.key === "CORRECTION" || reason.key === "ADJUSTMENT";
            return (
              <>
                {adjustTarget?.trackSerial ? (
                  <>
                    {reason.direction === "either" && (
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 text-sm dark:bg-gray-800">
                        {(["out", "in"] as const).map((w) => (
                          <button key={w} type="button" onClick={() => { setAdjustWay(w); setAdjustImeis([]); }} className={cn("rounded-md py-1.5 font-medium", adjustWay === w ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
                            {w === "out" ? "Remove phones" : "Add phones"}
                          </button>
                        ))}
                      </div>
                    )}
                    <ImeiAdjustFields
                      key={`${adjust.reasonType}-${adjustWay}`}
                      itemId={adjustTarget.itemId}
                      branchId={adjustBranchId}
                      direction={reason.direction === "either" ? adjustWay : reason.direction}
                      value={adjustImeis}
                      onChange={setAdjustImeis}
                    />
                  </>
                ) : (
                <Input
                  label={reason.direction === "either" ? "Quantity (+ to add, − to remove)" : reason.direction === "out" ? "Quantity taken out" : "Quantity put back"}
                  value={adjust.quantity}
                  inputMode="numeric"
                  onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}
                  placeholder={reason.direction === "either" ? "-5 or 10" : "1"}
                />
                )}
                {reason.key === "REPAIR_USE" && canLinkRepairs && (
                  <Select label="Repair job (adds the part cost to it)" value={adjust.repairJobId} onChange={(e) => setAdjust({ ...adjust, repairJobId: e.target.value })}>
                    <option value="">— not linked —</option>
                    {openJobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.jobNo} · {j.deviceBrand} {j.deviceModel}{j.customerName ? ` · ${j.customerName}` : ""}</option>
                    ))}
                  </Select>
                )}
                <Input
                  label={needsWords ? "Reason (required)" : "Note (optional)"}
                  value={adjust.reason}
                  onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setAdjustTarget(null)}>Cancel</Button>
                  <Button
                    variant={reason.direction === "in" ? "primary" : "danger"}
                    onClick={doAdjust}
                    disabled={busy || !adjustBranchId || !qty || (needsWords && !adjust.reason.trim())}
                  >
                    {reason.direction === "out" && qty ? `Take out ${Math.abs(qty)}` : reason.direction === "in" && qty ? `Put back ${Math.abs(qty)}` : "Adjust stock"}
                  </Button>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}

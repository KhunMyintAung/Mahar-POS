"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Button, Card, Input, Modal, Select, Spinner, Table, Empty, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

interface Level {
  itemId: string; name: string; sku: string; unit?: string; category?: string;
  minStock: number; costPrice: string; sellingPrice: string; totalQty: number; low: boolean;
  byBranch: { branchId: string; quantity: number }[];
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
  const [adjust, setAdjust] = useState({ quantity: "", reason: "" });
  const [adjustBranchId, setAdjustBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("ALL");
  const [q, setQ] = useState("");
  const { push } = useToast();
  const { hasPerm, branches, defaultBranchId } = useAuth();

  const load = useCallback(() => {
    api<Level[]>("/api/v1/stock").then(setLevels).catch((e) => push(e.message, "error"));
    api<Movement[]>("/api/v1/stock?movements=1").then(setMovements).catch(() => {});
  }, [push]);
  useEffect(load, [load]);

  async function doAdjust() {
    if (!adjustTarget) return;
    setBusy(true);
    try {
      await api("/api/v1/stock", {
        method: "POST",
        body: {
          itemId: adjustTarget.itemId,
          branchId: adjustBranchId,
          quantity: parseInt(adjust.quantity),
          reason: adjust.reason,
        },
      });
      push("Stock adjusted");
      setAdjustTarget(null); setAdjust({ quantity: "", reason: "" });
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
  const groups = categories
    .map((c) => ({ name: c, rows: shown.filter((l) => categoryOf(l) === c) }))
    .filter((g) => g.rows.length > 0);
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
          <Table headers={["Item", "SKU", "Qty", "Min", "Stock value (cost)", ""]} rightAlign={[2, 3, 4]}>
            {groups.map((g) => [
              <tr key={`group-${g.name}`} className="bg-gray-50 dark:bg-gray-800/60">
                <td colSpan={2} className="px-3 py-2 text-sm font-semibold">
                  {g.name === UNCATEGORISED ? "No category" : g.name}
                  <span className="ml-2 text-xs font-normal text-gray-500">{g.rows.length} item(s)</span>
                </td>
                <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">{g.rows.reduce((n, l) => n + l.totalQty, 0)}</td>
                <td />
                <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">{fmtMoney(valueOf(g.rows).toString())}</td>
                <td />
              </tr>,
              ...g.rows.map((l) => (
              <tr key={l.itemId} className={l.low ? "bg-red-50 dark:bg-red-900/10" : ""}>
                <td className="px-3 py-2.5 pl-6 font-medium">{l.name}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{l.sku}</td>
                <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", l.low && "text-red-600")}>
                  {l.totalQty} {l.unit ?? ""}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{l.minStock}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney((BigInt(l.costPrice) * BigInt(l.totalQty)).toString())}</td>
                <td className="px-3 py-2.5 text-right">
                  {hasPerm("stock.adjust") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdjust({ quantity: "", reason: "" });
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
            ])}
          </Table>
        )
      ) : movements.length === 0 ? <Card><Empty message="No movements" /></Card> : (
        <Table headers={["Date", "Item", "Type", "Qty", "After", "Notes"]} rightAlign={[3, 4]}>
          {movements.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(m.createdAt)}</td>
              <td className="px-3 py-2">{m.item.name}</td>
              <td className="px-3 py-2 text-xs">{m.type.replace(/_/g, " ")}</td>
              <td className={cn("px-3 py-2 text-right font-medium tabular-nums", m.quantity > 0 ? "text-green-600" : "text-red-600")}>
                {m.quantity > 0 ? "+" : ""}{m.quantity}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{m.qtyAfter}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{m.notes ?? ""}</td>
            </tr>
          ))}
        </Table>
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
          <Input label="Adjustment (+ to add, − to remove)" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} placeholder="-5 or 10" />
          <Input label="Reason (required)" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={doAdjust} disabled={busy || !adjustBranchId || !parseInt(adjust.quantity) || !adjust.reason.trim()}>
              Adjust stock
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

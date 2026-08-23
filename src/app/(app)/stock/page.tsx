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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stock</h1>
        {lowCount > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">{lowCount} low stock</span>}
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(["levels", "movements"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "levels" ? (
        levels.length === 0 ? <Card><Empty message="No items" /></Card> : (
          <Table headers={["Item", "SKU", "Category", "Qty", "Min", "Stock value (cost)", ""]} rightAlign={[3, 4, 5]}>
            {levels.map((l) => (
              <tr key={l.itemId} className={l.low ? "bg-red-50 dark:bg-red-900/10" : ""}>
                <td className="px-3 py-2.5 font-medium">{l.name}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{l.sku}</td>
                <td className="px-3 py-2.5 text-xs">{l.category ?? "—"}</td>
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
            ))}
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

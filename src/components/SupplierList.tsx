"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Empty, Input, Modal, Table, useToast } from "@/components/ui";

export interface Supplier { id: string; name: string; phone?: string | null; address?: string | null; notes?: string | null }
/** What the shop has bought from one supplier: purchases, their total, and what is still owed. */
export interface SupplierTotals { count: number; total: bigint; unpaid: bigint }

const emptyForm = { name: "", phone: "", telegram: "", address: "", notes: "" };

/** Add a supplier; calls back with the new one so the caller can pick it straight away. */
export function NewSupplierModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: Supplier) => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  function close() {
    setForm(emptyForm);
    onClose();
  }

  async function create() {
    setBusy(true);
    try {
      const created = await api<Supplier>("/api/v1/customers", {
        method: "POST",
        body: { ...form, type: "SUPPLIER", currency: "MMK", creditLimit: "0" },
      });
      push("Supplier created");
      setForm(emptyForm);
      onCreated(created);
    } catch (error) {
      push(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="New supplier">
      <div className="space-y-3">
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Telegram" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
        </div>
        <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={create} disabled={busy || !form.name.trim()}>{busy ? "Saving..." : "Create supplier"}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** The Suppliers tab of Purchases: each supplier with what was bought from them, a way to see
 *  those purchases, and a new purchase from them in one tap. */
export function SupplierList({ suppliers, totals, onShowPurchases, onNewPurchase }: {
  suppliers: Supplier[];
  totals: Map<string, SupplierTotals>;
  onShowPurchases: (s: Supplier) => void;
  /** Left out when the user cannot record purchases. */
  onNewPurchase?: (s: Supplier) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = suppliers.filter((s) => !needle || s.name.toLowerCase().includes(needle) || (s.phone ?? "").includes(needle));

  return (
    <div className="space-y-3">
      <input
        placeholder="Search supplier name or phone..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:max-w-xs sm:text-sm"
      />
      {shown.length === 0 ? (
        <Card><Empty message="No suppliers found" /></Card>
      ) : (
        <Table headers={["Name", "Phone", "Purchases", "Bought", "Unpaid", ""]} rightAlign={[2, 3, 4]}>
          {shown.map((s) => {
            const t = totals.get(s.id);
            return (
              <tr key={s.id}>
                <td className="px-3 py-2.5">
                  <Link href={`/customers/${s.id}`} className="font-medium text-blue-600 hover:underline">{s.name}</Link>
                  {s.address && <div className="max-w-[16rem] truncate text-xs text-gray-500">{s.address}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm">{s.phone || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t?.count ?? 0}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtMoney((t?.total ?? 0n).toString())}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${t && t.unpaid > 0n ? "font-semibold text-amber-600" : "text-gray-400"}`}>
                  {fmtMoney((t?.unpaid ?? 0n).toString())}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {(t?.count ?? 0) > 0 && <Button size="sm" variant="ghost" onClick={() => onShowPurchases(s)}>Purchases</Button>}
                  {onNewPurchase && <Button size="sm" variant="secondary" onClick={() => onNewPurchase(s)}>New purchase</Button>}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

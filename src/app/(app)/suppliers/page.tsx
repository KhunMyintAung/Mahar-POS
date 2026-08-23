"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Empty, Input, Modal, Spinner, Table, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

const emptyForm = { name: "", phone: "", telegram: "", address: "", notes: "" };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { hasPerm } = useAuth();
  const { push } = useToast();
  const router = useRouter();

  const load = useCallback(() => {
    const params = new URLSearchParams({ type: "SUPPLIER", pageSize: "100" });
    if (q) params.set("q", q);
    api<{ contacts: Supplier[] }>(`/api/v1/customers?${params}`)
      .then((data) => setSuppliers(data.contacts))
      .catch((error) => push(error.message, "error"));
  }, [q, push]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function createSupplier() {
    setBusy(true);
    try {
      await api("/api/v1/customers", {
        method: "POST",
        body: { ...form, type: "SUPPLIER", currency: "MMK", creditLimit: "0" },
      });
      push("Supplier created");
      setShowNew(false);
      setForm(emptyForm);
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Suppliers</h1>
        {hasPerm("customer.manage") && (
          <Button onClick={() => { setForm(emptyForm); setShowNew(true); }}>
            <Plus size={16} className="mr-1 inline" />New supplier
          </Button>
        )}
      </div>

      <Input
        placeholder="Search supplier name or phone..."
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="max-w-xs"
      />

      {!suppliers ? <Spinner /> : suppliers.length === 0 ? (
        <Card><Empty message="No suppliers found" /></Card>
      ) : (
        <Table headers={["Name", "Phone", "Address", "Notes"]}>
          {suppliers.map((supplier) => (
            <tr
              key={supplier.id}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              onClick={() => router.push(`/customers/${supplier.id}`)}
            >
              <td className="px-3 py-2.5 font-medium text-blue-600">{supplier.name}</td>
              <td className="px-3 py-2.5">{supplier.phone ?? "-"}</td>
              <td className="px-3 py-2.5 text-xs">{supplier.address ?? "-"}</td>
              <td className="px-3 py-2.5 text-xs text-gray-500">{supplier.notes ?? ""}</td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New supplier">
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Telegram" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </div>
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={createSupplier} disabled={busy || !form.name.trim()}>
              {busy ? "Saving..." : "Create supplier"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

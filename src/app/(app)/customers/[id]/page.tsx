"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { MapPin, Pencil } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/components/AppShell";

interface Data {
  contact: { id: string; name: string; phone?: string; telegram?: string; address?: string; type: string; creditLimit: string; notes?: string };
  receivables: {
    id: string; txnNo: string; originalAmount: string; remainingAmount: string; status: string; dueDate?: string;
    creditDate: string; reference?: string; notes?: string;
    sale?: { saleNo: string; date: string; items: { name: string; quantity: number; lineTotal: string }[] } | null;
  }[];
  currentReceivable: string;
  currentPayable: string;
}

export default function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string; address: string; notes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<Data>(`/api/v1/customers/${id}`).then(setData).catch((e) => push(e.message, "error"));
  }, [id, push]);
  useEffect(load, [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await api(`/api/v1/customers/${id}`, { method: "PATCH", body: edit });
      push("Saved");
      setEdit(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;
  const c = data.contact;

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div>
        <PageHeader title={<>{c.name}</>}>
          {hasPerm("customer.manage") && (
            <Button variant="secondary" onClick={() => setEdit({ name: c.name, phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" })}>
              <Pencil size={14} className="mr-1 inline" />Edit
            </Button>
          )}
        </PageHeader>
        <p className="text-sm text-gray-500">
          {c.type} {c.phone && `· ${c.phone}`} {c.telegram && `· ${c.telegram}`}
        </p>
        {c.address && (
          <p className="mt-1 flex items-start gap-1 text-sm"><MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />{c.address}</p>
        )}
        {/* A supplier's purchases are in Purchases, filtered to them. */}
        {c.type === "SUPPLIER" && (
          <Link href={`/purchases?supplier=${c.id}`} className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline">Purchases from this supplier</Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Current receivable" value={fmtMoney(data.currentReceivable, "MMK")} tone="blue" />
        <StatCard label="Current payable" value={fmtMoney(data.currentPayable, "MMK")} tone="amber" />
        <StatCard label="Credit limit" value={fmtMoney(c.creditLimit, "MMK")} />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Credit history</h3>
        {data.receivables.length === 0 ? <Empty message="No credit records" /> : (
          <Table headers={["Date", "Bought", "Original", "Remaining", "Due", "Status"]} rightAlign={[2, 3]}>
            {data.receivables.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{r.creditDate}<br /><span className="text-gray-500">{r.sale?.saleNo ?? r.txnNo}</span></td>
                <td className="px-3 py-2 text-xs">
                  {r.sale ? r.sale.items.map((l) => `${l.name} ×${l.quantity}`).join(", ") : r.reference || (r.notes?.startsWith("Auto-created") ? "" : r.notes) || "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.originalAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.remainingAmount)}</td>
                <td className="px-3 py-2 text-xs">{r.dueDate ?? "—"}</td>
                <td className="px-3 py-2"><Badge status={r.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit ${c.name}`}>
        {edit && (
          <div className="space-y-3">
            <Input label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Input label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            <Input label="Shop address" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            <Input label="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !edit.name.trim()}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

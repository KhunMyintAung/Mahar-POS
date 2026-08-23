"use client";

import { useCallback, useEffect, useState, use } from "react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Card, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";

interface Data {
  contact: { id: string; name: string; phone?: string; telegram?: string; address?: string; type: string; creditLimit: string; notes?: string };
  receivables: { id: string; txnNo: string; originalAmount: string; remainingAmount: string; status: string; dueDate?: string }[];
  currentReceivable: string;
  currentPayable: string;
}

export default function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const { push } = useToast();

  const load = useCallback(() => {
    api<Data>(`/api/v1/customers/${id}`).then(setData).catch((e) => push(e.message, "error"));
  }, [id, push]);
  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const c = data.contact;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{c.name}</h1>
        <p className="text-sm text-gray-500">
          {c.type} {c.phone && `· ${c.phone}`} {c.telegram && `· ${c.telegram}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Current receivable" value={fmtMoney(data.currentReceivable, "MMK")} tone="blue" />
        <StatCard label="Current payable" value={fmtMoney(data.currentPayable, "MMK")} tone="amber" />
        <StatCard label="Credit limit" value={fmtMoney(c.creditLimit, "MMK")} />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Credit history</h3>
        {data.receivables.length === 0 ? <Empty message="No credit records" /> : (
          <Table headers={["Txn", "Original", "Remaining", "Due", "Status"]} rightAlign={[1, 2]}>
            {data.receivables.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs">{r.txnNo}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.originalAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(r.remainingAmount)}</td>
                <td className="px-3 py-2 text-xs">{r.dueDate ?? "—"}</td>
                <td className="px-3 py-2"><Badge status={r.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

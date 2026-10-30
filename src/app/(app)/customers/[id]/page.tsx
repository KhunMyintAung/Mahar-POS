"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Spinner, Badge, Table, Empty, StatCard, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/components/AppShell";

interface Data {
  contact: { id: string; name: string; phone?: string; telegram?: string; address?: string; type: string; creditLimit: string; notes?: string; mspAddress?: string | null };
  receivables: { id: string; txnNo: string; originalAmount: string; remainingAmount: string; status: string; dueDate?: string }[];
  currentReceivable: string;
  currentPayable: string;
  msp: {
    pending: string; sending: string; minted: string; explorer: string | null; contract: string | null;
    awards: { id: string; points: string; status: string; createdAt: string; txnNo: string | null; txHash: string | null }[];
  };
}

/** Mahar Shwe Point: the customer's wallet and the points their purchases earned. */
function MspCard({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const [address, setAddress] = useState(data.contact.mspAddress ?? "");
  const [busy, setBusy] = useState(false);
  const m = data.msp;
  const changed = address.trim() !== (data.contact.mspAddress ?? "");

  async function save() {
    setBusy(true);
    try {
      await api(`/api/v1/customers/${data.contact.id}`, { method: "PATCH", body: { mspAddress: address.trim() } });
      push("Wallet saved");
      onSaved();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Mahar Shwe Point (MSP)</h3>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div><div className="text-xs text-gray-500">Waiting</div><div className="font-semibold tabular-nums">{m.pending}</div></div>
        <div><div className="text-xs text-gray-500">On the way</div><div className="font-semibold tabular-nums">{m.sending}</div></div>
        <div><div className="text-xs text-gray-500">In wallet</div><div className="font-semibold tabular-nums">{m.minted}</div></div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <Input label="Customer's BNB Chain wallet" placeholder="0x…" value={address} spellCheck={false} autoComplete="off"
            disabled={!hasPerm("customer.manage")} onChange={(e) => setAddress(e.target.value)} className="font-mono" />
        </div>
        {hasPerm("customer.manage") && <Button disabled={busy || !changed} onClick={save}>Save wallet</Button>}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Points wait here until the customer has a wallet. No wallet yet? They can make one free at{" "}
        <a className="text-blue-600 hover:underline" href="https://token.maharpos.shop/wallet/" target="_blank" rel="noopener noreferrer">token.maharpos.shop/wallet</a>
        {" "}or use MetaMask / Trust Wallet, and read you their address.
      </p>
      {m.awards.length > 0 && (
        <div className="mt-3">
          <Table headers={["Sale", "MSP", "Status", ""]} rightAlign={[1]}>
            {m.awards.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 text-xs">{a.txnNo ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.points}</td>
                <td className="px-3 py-2 text-xs">{a.status}</td>
                <td className="px-3 py-2 text-xs">
                  {a.txHash && m.explorer && <a className="text-blue-600 hover:underline" href={`${m.explorer}/tx/${a.txHash}`} target="_blank" rel="noopener noreferrer">BscScan</a>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  );
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
    <div className="mx-auto max-w-5xl space-y-3">
      <div>
        <PageHeader title={<>{c.name}</>} />
        <p className="text-sm text-gray-500">
          {c.type} {c.phone && `· ${c.phone}`} {c.telegram && `· ${c.telegram}`}
        </p>
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

      {c.type === "CUSTOMER" && <MspCard key={c.mspAddress ?? ""} data={data} onSaved={load} />}

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

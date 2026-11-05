"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, StatCard, useToast } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { ContactCsvTools, type ContactBalanceRow } from "@/components/ContactCsv";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";
import { PageHeader } from "@/components/PageHeader";


/** The value has to be written out.
 *
 *  An <option> with no value attribute submits its own text, and this app translates the
 *  text in the page — so in Myanmar the select posted "ကုန်သွင်းသူ" where the API expects
 *  "SUPPLIER", and saving a supplier failed with a validation error nobody could act on.
 */
const CONTACT_TYPES = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "SUPPLIER", label: "Supplier" },
  { value: "AGENT", label: "Agent" },
  { value: "CREDITOR", label: "Creditor" },
  { value: "DEBTOR", label: "Debtor" },
  { value: "OTHER", label: "Other" },
];

export default function CustomersPage() {
  const [contacts, setContacts] = useState<ContactBalanceRow[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const [form, setForm] = useState({ name: "", phone: "", telegram: "", address: "", type: "CUSTOMER", notes: "" });

  // Every contact of the type with what they owe and are owed; the search filters here.
  const load = useCallback(() => {
    api<ContactBalanceRow[]>(`/api/v1/customers/balances${type ? `?type=${type}` : ""}`)
      .then(setContacts)
      .catch((e) => push(e.message, "error"));
  }, [type, push]);
  useEffect(load, [load]);
  const needle = q.trim().toLowerCase();
  const shown = (contacts ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.phone ?? "").includes(needle));
  const showRec = shown.some((c) => c.theyOwe !== null);
  const showPay = shown.some((c) => c.weOwe !== null);
  const sumOf = (k: "theyOwe" | "weOwe") => shown.reduce((n, c) => n + BigInt(c[k] ?? "0"), 0n);

  async function create() {
    setBusy(true);
    try {
      await api("/api/v1/customers", { method: "POST", body: form });
      push("Contact created");
      setShowNew(false);
      setForm({ name: "", phone: "", telegram: "", address: "", type: "CUSTOMER", notes: "" });
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader
        title={<>Customers & Contacts</>}
        lead={
          <>
            <input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 sm:text-sm min-w-0 flex-1 sm:max-w-xs" />
            <select value={type} onChange={(e) => setType(e.target.value)} className="min-h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800">
              <option value="">All types</option>
              {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <ContactCsvTools type={type === "CUSTOMER" || type === "SUPPLIER" ? type : ""} label={type === "SUPPLIER" ? "Suppliers" : type === "CUSTOMER" ? "Customers" : "Contacts"} onDone={load} />
          {hasPerm("customer.manage") && (
            <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New contact</Button>
          )}
        </div>
      </PageHeader>

      {(showRec || showPay) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {showRec && <StatCard label="Customers owe us" value={fmtMoney(sumOf("theyOwe").toString(), "MMK")} tone="amber" />}
          {showPay && <StatCard label="We owe suppliers" value={fmtMoney(sumOf("weOwe").toString(), "MMK")} tone="red" />}
        </div>
      )}

      {!contacts ? <Spinner /> : shown.length === 0 ? (
        <Card><Empty message="No contacts found" /></Card>
      ) : (
        <Table headers={["Name", "Phone", "Type", "Sold / bought", ...(showRec ? ["They owe us"] : []), ...(showPay ? ["We owe them"] : []), "Notes"]}
          rightAlign={[3, 4, ...(showRec && showPay ? [5] : [])]}>
          {shown.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => router.push(`/customers/${c.id}`)}>
              <td className="px-3 py-2.5 font-medium text-blue-600">{c.name}</td>
              <td className="px-3 py-2.5">{c.phone ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs">{c.type}</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                {BigInt(c.sold) > 0n && <div>{fmtMoney(c.sold)}</div>}
                {BigInt(c.bought) > 0n && <div className="text-gray-500">{fmtMoney(c.bought)}</div>}
              </td>
              {showRec && <td className="px-3 py-2.5 text-right tabular-nums">{c.theyOwe && BigInt(c.theyOwe) > 0n ? <b className="text-amber-700 dark:text-amber-400">{fmtMoney(c.theyOwe)}</b> : "—"}</td>}
              {showPay && <td className="px-3 py-2.5 text-right tabular-nums">{c.weOwe && BigInt(c.weOwe) > 0n ? <b className="text-red-600">{fmtMoney(c.weOwe)}</b> : "—"}</td>}
              <td className="px-3 py-2.5 text-xs text-gray-500">{c.notes ?? ""}</td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New contact">
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <Input label="Telegram" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          <Input label="Shop address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !form.name}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

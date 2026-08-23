"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, Select, Modal, Spinner, Table, Empty, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { useNewModal } from "@/lib/useNewModal";

interface Contact { id: string; name: string; phone?: string; type: string; active: boolean; notes?: string }

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
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [showNew, setShowNew] = useNewModal();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const [form, setForm] = useState({ name: "", phone: "", telegram: "", address: "", type: "CUSTOMER", notes: "" });

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    api<{ contacts: Contact[] }>(`/api/v1/customers?${params}`)
      .then((d) => setContacts(d.contacts))
      .catch((e) => push(e.message, "error"));
  }, [q, type, push]);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

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
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Customers & Contacts</h1>
        {hasPerm("customer.manage") && (
          <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1 inline" />New contact</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </div>

      {!contacts ? <Spinner /> : contacts.length === 0 ? (
        <Card><Empty message="No contacts found" /></Card>
      ) : (
        <Table headers={["Name", "Phone", "Type", "Notes"]}>
          {contacts.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => router.push(`/customers/${c.id}`)}>
              <td className="px-3 py-2.5 font-medium text-blue-600">{c.name}</td>
              <td className="px-3 py-2.5">{c.phone ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs">{c.type}</td>
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
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

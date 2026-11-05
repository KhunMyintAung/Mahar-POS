"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { api } from "@/lib/client";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { CONTACT_TEMPLATE } from "@/lib/contactCsv";
import { Button, Modal, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";

export interface ContactBalanceRow {
  id: string; name: string; phone?: string | null; type: string; telegram?: string | null; address?: string | null;
  notes?: string | null; creditLimit: string; active: boolean;
  theyOwe: string | null; weOwe: string | null; openCount: number; sold: string; bought: string;
}

const kyat = (minor: string | null) => (minor === null ? "" : (Number(BigInt(minor)) / 100).toString());

/** Export CSV and Import CSV for customers or suppliers (type), with what each owes. */
export function ContactCsvTools({ type, label, onDone }: { type: "CUSTOMER" | "SUPPLIER" | ""; label: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; rejected: { row: number; reason: string }[]; unknownColumns: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();
  const { hasPerm } = useAuth();

  async function exportCsv() {
    try {
      const rows = await api<ContactBalanceRow[]>(`/api/v1/customers/balances${type ? `?type=${type}` : ""}`);
      const showRec = rows.some((r) => r.theyOwe !== null);
      const showPay = rows.some((r) => r.weOwe !== null);
      const head = ["Name", "Phone", "Type", "Telegram", "Address", "Notes", "Credit limit", "Sold to them", "Bought from them",
        ...(showRec ? ["They owe us"] : []), ...(showPay ? ["We owe them"] : [])];
      const body = rows.map((r) => [r.name, r.phone ?? "", r.type, r.telegram ?? "", r.address ?? "", r.notes ?? "", kyat(r.creditLimit),
        kyat(r.sold), kyat(r.bought), ...(showRec ? [kyat(r.theyOwe)] : []), ...(showPay ? [kyat(r.weOwe)] : [])]);
      downloadCsv(`${label.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`, rowsToCsv([head, ...body]));
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const r = await api<NonNullable<typeof result>>("/api/v1/customers/import", { method: "POST", body: { csv: text, type: type || "CUSTOMER" } });
      setResult(r);
      push(`Imported — ${r.created} new, ${r.updated} updated`);
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => void exportCsv()}><Download size={16} className="mr-1 inline" />Export CSV</Button>
      {hasPerm("customer.manage") && (
        <Button variant="secondary" onClick={() => { setOpen(true); setText(""); setResult(null); }}><Upload size={16} className="mr-1 inline" />Import CSV</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`Import ${label.toLowerCase()} from a CSV`}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
          <Button disabled={busy || !text.trim()} onClick={() => void runImport()}>Import</Button>
        </>}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => { setText(t); setResult(null); }); }}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" />
            <Button variant="secondary" size="sm" onClick={() => downloadCsv("contacts-template", "﻿" + CONTACT_TEMPLATE)}>
              <Download size={15} className="mr-1 inline" />Template
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Columns: Name, Phone, Type (Customer / Supplier), Telegram, Address, Notes, Credit limit. Only the name is required.
            A row whose phone matches an existing contact of the same type updates it; any other row is added.
          </p>
          {text && !result && <p className="text-sm">{`${Math.max(0, text.trim().split(/\r?\n/).length - 1)} rows ready`}</p>}
          {result && (
            <div className="space-y-1 text-sm">
              <p>{`${result.created} new, ${result.updated} updated, ${result.rejected.length} skipped`}</p>
              {result.unknownColumns.length > 0 && <p className="text-xs text-amber-700">{`Columns not used: ${result.unknownColumns.join(", ")}`}</p>}
              {result.rejected.map((r) => <p key={r.row} className="text-xs text-red-600">{`Row ${r.row}: ${r.reason}`}</p>)}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

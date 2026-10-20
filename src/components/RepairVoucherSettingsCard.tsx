"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Input, useToast } from "@/components/ui";
import { DEFAULT_REPAIR_TERMS, formatVoucherNo, type RepairVoucherSettings } from "@/lib/repairVoucherSettings";

type Loaded = RepairVoucherSettings & { nextNumber: number; autoPrefix: string };

/** Settings → Repair voucher: the number format (MS001) and the text printed on the slip. */
export function RepairVoucherSettingsCard() {
  const [form, setForm] = useState<{
    prefix: string; digits: string; nextNumber: string; tagline: string; terms: string; qrCaption: string;
  } | null>(null);
  const [loadedNext, setLoadedNext] = useState(1);
  const [autoPrefix, setAutoPrefix] = useState("RP");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  function fill(d: Loaded) {
    setLoadedNext(d.nextNumber);
    setAutoPrefix(d.autoPrefix);
    setForm({
      prefix: d.prefix, digits: String(d.digits), nextNumber: String(d.nextNumber),
      tagline: d.tagline, terms: d.terms.join("\n"), qrCaption: d.qrCaption,
    });
  }

  useEffect(() => {
    api<Loaded>("/api/v1/settings/repair-voucher").then(fill).catch((e) => push(e.message, "error"));
  }, [push]);

  if (!form) return null;

  const digits = Math.min(8, Math.max(1, Number(form.digits) || 4));
  const next = Number(form.nextNumber) || 1;
  const preview = formatVoucherNo(form.prefix.trim().toUpperCase() || autoPrefix, digits, next);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const saved = await api<Loaded>("/api/v1/settings/repair-voucher", {
        method: "PUT",
        body: {
          prefix: form.prefix.trim(),
          digits,
          // Only sent when changed, so saving the text never moves the counter.
          nextNumber: next !== loadedNext ? next : undefined,
          tagline: form.tagline,
          terms: form.terms.split("\n").map((t) => t.trim()).filter(Boolean),
          qrCaption: form.qrCaption,
        },
      });
      fill(saved);
      push("Settings saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold">Repair voucher</h3>
      <p className="mb-3 mt-1 text-xs text-gray-500">Voucher number format and the text printed on the repair voucher.</p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Voucher prefix" value={form.prefix} maxLength={6} placeholder={autoPrefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} />
          <Input label="Digits" type="number" min={1} max={8} value={form.digits} onChange={(e) => setForm({ ...form, digits: e.target.value })} />
          <Input label="Next number" type="number" min={1} value={form.nextNumber} onChange={(e) => setForm({ ...form, nextNumber: e.target.value })} />
        </div>
        <p className="text-xs text-gray-500">
          Next voucher: <b className="font-mono text-gray-800 dark:text-gray-200">{preview}</b>
          {" "}— leave the prefix empty to use {autoPrefix}, from your shop name.
        </p>
        <Input label="Line under shop name" value={form.tagline} placeholder="ဖုန်းပြင်ဆိုင်နှင့် အရောင်းဆိုင်" onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Warnings (one per line)</span>
          <textarea
            rows={6}
            value={form.terms}
            onChange={(e) => setForm({ ...form, terms: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setForm({ ...form, terms: DEFAULT_REPAIR_TERMS.join("\n") })}>
          Reset warnings to default
        </button>
        <Input label="Text under QR" value={form.qrCaption} onChange={(e) => setForm({ ...form, qrCaption: e.target.value })} />
        <Button disabled={busy} onClick={save}>Save voucher settings</Button>
      </div>
    </Card>
  );
}

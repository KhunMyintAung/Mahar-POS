"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ReceiptText } from "lucide-react";
import { Button, Card, CardTitle, Input, Select, useToast } from "@/components/ui";
import { useCurrency } from "@/components/AppShell";
import type { AppLanguage } from "@/lib/currency";
import { VOUCHER_TEXT } from "@/lib/repairVoucherText";
import {
  defaultRepairTerms, formatVoucherNo, isDefaultTerms, voucherLanguage,
  type RepairVoucherSettings, type VoucherLanguageChoice,
} from "@/lib/repairVoucherSettings";

type Loaded = RepairVoucherSettings & { nextNumber: number; autoPrefix: string };

/** Each language under its own name, so it reads the same whatever language the screen is in. */
const LANGUAGE_NAMES: Record<AppLanguage, string> = { mm: "မြန်မာ", en: "English", th: "ไทย" };
const lines = (text: string) => text.split("\n").map((t) => t.trim()).filter(Boolean);

/** Settings → Repair voucher: the number format (MS001), the language and the text printed on the slip. */
export function RepairVoucherSettingsCard() {
  const [form, setForm] = useState<{
    prefix: string; digits: string; nextNumber: string; language: VoucherLanguageChoice; tagline: string; terms: string; qrCaption: string;
  } | null>(null);
  const [loadedNext, setLoadedNext] = useState(1);
  const [autoPrefix, setAutoPrefix] = useState("RP");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const currency = useCurrency();

  function fill(d: Loaded) {
    setLoadedNext(d.nextNumber);
    setAutoPrefix(d.autoPrefix);
    setForm({
      prefix: d.prefix, digits: String(d.digits), nextNumber: String(d.nextNumber), language: d.language,
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
  const printLanguage = voucherLanguage(form.language, currency);

  /** Another language: the ready-made warnings and QR caption change with it; text the shop
   *  wrote itself stays. */
  function pickLanguage(language: VoucherLanguageChoice) {
    if (!form) return;
    const from = VOUCHER_TEXT[printLanguage];
    const to = VOUCHER_TEXT[voucherLanguage(language, currency)];
    setForm({
      ...form,
      language,
      terms: isDefaultTerms(lines(form.terms)) ? to.terms.join("\n") : form.terms,
      qrCaption: form.qrCaption.trim() === from.qrCaption ? to.qrCaption : form.qrCaption,
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const saved = await api<Loaded>("/api/v1/settings/repair-voucher", {
        method: "PUT",
        body: {
          prefix: form.prefix.trim(),
          digits,
          language: form.language,
          // Only sent when changed, so saving the text never moves the counter.
          nextNumber: next !== loadedNext ? next : undefined,
          tagline: form.tagline,
          terms: lines(form.terms),
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
      <CardTitle icon={ReceiptText} title="Repair voucher" className="mb-3" hint="Voucher number format and the text printed on the repair voucher." />
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
        <Select label="Voucher language" value={form.language} onChange={(e) => pickLanguage(e.target.value as VoucherLanguageChoice)}>
          <option value="auto">{`Auto · ${currency} · ${LANGUAGE_NAMES[voucherLanguage("auto", currency)]}`}</option>
          {(Object.keys(LANGUAGE_NAMES) as AppLanguage[]).map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
        </Select>
        <p className="text-xs text-gray-500">{"The voucher and the customer's status page are written in this language, whatever language the app is shown in."}</p>
        <Input label="Line under shop name" value={form.tagline} placeholder={printLanguage === "mm" ? "ဖုန်းပြင်ဆိုင်နှင့် အရောင်းဆိုင်" : undefined} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Warnings (one per line)</span>
          <textarea
            rows={6}
            value={form.terms}
            onChange={(e) => setForm({ ...form, terms: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setForm({ ...form, terms: defaultRepairTerms(printLanguage).join("\n") })}>
          Reset warnings to default
        </button>
        <Input label="Text under QR" value={form.qrCaption} onChange={(e) => setForm({ ...form, qrCaption: e.target.value })} />
        <Button disabled={busy} onClick={save}>Save voucher settings</Button>
      </div>
    </Card>
  );
}

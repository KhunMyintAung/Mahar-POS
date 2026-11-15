"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { shrinkImage } from "@/lib/imageShrink";
import { Button, cn, useToast } from "@/components/ui";
import { BrandChip } from "@/components/BrandChip";

/** A small palette for a chip colour. */
const SWATCHES = [
  "#1657b0", "#0f5aa6", "#0096d6", "#00857a", "#1a9e4b", "#1a7f3c",
  "#f2a900", "#e8551f", "#ed1c24", "#d81e2c", "#be123c", "#6a2c91",
  "#5b2a86", "#13294b", "#475569", "#0f172a",
];

/** Pick a colour for the chip, or Auto to use the name-matched colour. Shown only when a logo
 *  is not set, since a logo replaces the colour chip. */
export function ColorPicker({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Chip colour</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onChange(null)} title="Auto (match the name)"
          className={cn("h-7 rounded-md border px-2 text-xs font-medium", !value ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-300 dark:border-gray-600")}>
          Auto
        </button>
        {SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} title={c} aria-label={c}
            className={cn("flex h-7 w-7 items-center justify-center rounded-md ring-offset-1 dark:ring-offset-gray-900", value === c && "ring-2 ring-gray-900 dark:ring-white")}
            style={{ backgroundColor: c }}>
            {value === c && <Check size={14} className="text-white" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Picks a logo for a wallet or a biller: shrunk in the browser to a small data URL. While
 *  none is set, the account's colour chip stands in, both here and everywhere it is shown. */
export function LogoPicker({ label = "Logo", name, value, onChange }: {
  label?: string;
  /** The account name, for the fallback chip and alt text. */
  name: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await shrinkImage(file));
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not read the image", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {value
            // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
            ? <img src={value} alt={`${name} logo`} className="max-h-10 max-w-10 object-contain" />
            : <BrandChip name={name} />}
        </span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={14} className="mr-1 inline" />{busy ? "Reading…" : value ? "Change" : "Choose logo"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => onChange(null)}>
            <Trash2 size={14} className="mr-1 inline" />Remove
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{"No logo? The coloured chip is used. Upload only a logo you are allowed to use."}</p>
    </div>
  );
}

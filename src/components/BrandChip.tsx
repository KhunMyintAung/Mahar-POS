import { Banknote } from "lucide-react";
import { brandFor } from "@/lib/providerBrand";
import { cn } from "@/components/ui";

/** True when dark text reads better on this hex background. */
export function darkTextOn(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  // Rec. 601 luma; above ~0.6 the colour is light enough for dark text.
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6;
}

/** A small mark for a wallet or biller. The shop's own uploaded `logo` (a data URL) when it
 *  has one; otherwise a coloured chip — the shop's chosen `color`, or from its name
 *  (src/lib/providerBrand.ts) a known Myanmar provider's colour and short label, or steady
 *  initials. It makes the right account easy to spot so the wrong one is not picked.
 *  Decorative, so it is hidden from screen readers. */
export function BrandChip({ name, logo, color, size = "md", className }: { name: string; logo?: string | null; color?: string | null; size?: "sm" | "md"; className?: string }) {
  const box = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  if (logo) {
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white", box, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise */}
        <img src={logo} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }
  const b = brandFor(name);
  const bg = color || b.color;
  const dark = color ? darkTextOn(color) : b.dark;
  const dim = size === "sm" ? "h-5 min-w-5 text-[9px]" : "h-7 min-w-7 text-[11px]";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md px-1 font-bold leading-none", dim, className)}
      style={{ backgroundColor: bg, color: dark ? "#1f2937" : "#ffffff" }}
    >
      {b.cash ? <Banknote size={size === "sm" ? 12 : 15} /> : b.label}
    </span>
  );
}

/** How a biller sells: a pin-code Top-up card, or E-load sent straight to a number. The two
 *  are easy to mix up, so each gets its own tag. */
export function BillerKindTag({ type, className }: { type: string; className?: string }) {
  const eload = type === "ELOAD";
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold",
        eload
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
        className,
      )}
    >
      {eload ? "E-load" : "Top-up card"}
    </span>
  );
}

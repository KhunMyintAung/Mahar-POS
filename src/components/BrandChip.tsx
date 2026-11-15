import { Banknote } from "lucide-react";
import { brandFor } from "@/lib/providerBrand";
import { cn } from "@/components/ui";

/** A small coloured badge for a wallet or biller, from its name (src/lib/providerBrand.ts):
 *  a known Myanmar provider's colour and short label, or steady initials otherwise. It makes
 *  the right account easy to spot so the wrong one is not picked. Decorative, so it is hidden
 *  from screen readers. */
export function BrandChip({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  const b = brandFor(name);
  const dim = size === "sm" ? "h-5 min-w-5 text-[9px]" : "h-7 min-w-7 text-[11px]";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md px-1 font-bold leading-none", dim, className)}
      style={{ backgroundColor: b.color, color: b.dark ? "#1f2937" : "#ffffff" }}
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

"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from "react";
import { Check, Download, X, type LucideIcon } from "lucide-react";
import { STATUS_COLORS } from "@/lib/format";
import { playError, playSuccess } from "@/lib/sound";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_6px_rgba(16,24,40,0.04)] dark:border-gray-800 dark:bg-gray-900 sm:p-4", className)}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, onClick, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void;
  tone?: "green" | "red" | "blue" | "amber" | "default";
}) {
  // Each figure keeps its colour, but soft: pale shades and a faint line along the top, so
  // the page reads easily instead of glaring.
  const tones: Record<string, string> = {
    green: "text-emerald-700/85 dark:text-emerald-300/80",
    red: "text-red-700/85 dark:text-red-300/80",
    blue: "text-sky-700/85 dark:text-sky-300/80",
    amber: "text-amber-700/85 dark:text-amber-300/80",
    default: "text-navy-900 dark:text-gray-100",
  };
  const bars: Record<string, string> = {
    green: "bg-emerald-400/45", red: "bg-red-400/45", blue: "bg-sky-400/45", amber: "bg-amber-400/45",
    default: "bg-gold-500/40 dark:bg-gold-400/30",
  };
  return (
    <button
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-xl border border-gray-200/80 bg-white p-3 pt-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_6px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 sm:p-4 sm:pt-[1.125rem]"
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[2px]", bars[tone ?? "default"])} />
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums sm:text-xl", tones[tone ?? "default"])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </button>
  );
}

const TITLE_TONES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  red: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

/** The head of a card: its icon, title and a line on what it is for; children sit on the right. */
export function CardTitle({ icon: Icon, title, hint, tone = "blue", className, children }: {
  icon: LucideIcon; title: string; hint?: ReactNode; tone?: keyof typeof TITLE_TONES; className?: string; children?: ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", hint ? "items-start" : "items-center", className)}>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", TITLE_TONES[tone])}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <h3 className={cn("text-[15px] font-semibold leading-snug", tone === "red" && "text-red-700 dark:text-red-400")}>{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Progress from 0 to 1, with what is happening under it. */
export function ProgressBar({ value, label }: { value: number; label?: ReactNode }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      {label && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>}
    </div>
  );
}

/** An on / off switch. */
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-5" : "left-0.5")} />
    </button>
  );
}

export function Button({ children, onClick, type = "button", variant = "primary", disabled, className, size, title, "aria-label": ariaLabel }: {
  children: ReactNode; onClick?: () => void; type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; className?: string;
  size?: "sm" | "md";
  /** For an icon-only button: what it does, for screen readers and on hover. */
  title?: string; "aria-label"?: string;
}) {
  const variants = {
    primary: "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none",
    secondary: "border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
    danger: "bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700 disabled:bg-red-300 disabled:shadow-none",
    ghost: "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "whitespace-nowrap rounded-lg font-medium transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "min-h-9 px-2.5 py-1.5 text-xs" : "min-h-10 px-4 py-2 text-sm",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, ...props }: {
  label?: string; error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
      <input
        {...props}
        className={cn(
          "min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 sm:min-h-10 sm:text-sm",
          props.className
        )}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ label, children, ...props }: {
  label?: string; children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
      <select
        {...props}
        className={cn(
          "min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 sm:min-h-10 sm:text-sm",
          props.className
        )}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({ status }: { status: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** `footer` holds the form's buttons: it stays at the foot of the dialog while a long form
 *  scrolls above it, so Save is never below the screen. */
export function Modal({ open, onClose, title, children, wide, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/60 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className={cn(
          "flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:max-h-[92vh] sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-4 sm:p-5", footer ? "pb-3 sm:pb-3" : "pb-[max(1rem,env(safe-area-inset-bottom))]")}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="min-w-0 pr-2 text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">{title}</h2>
            <button onClick={onClose} className="min-h-10 min-w-10 rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={20} />
            </button>
          </div>
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-800 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** The table as shown, as CSV: its headings and each row's cells as text (a cell's lines
 *  joined with " · "), without the buttons column. Amounts written "1,500" or "-1,500 MMK"
 *  become 1500 / -1500 so a spreadsheet reads them as numbers. */
function tableToCsv(table: HTMLTableElement, skipLast: boolean): string {
  const cell = (el: Element) => {
    const text = ((el as HTMLElement).innerText ?? el.textContent ?? "").split(/\n+/).map((t) => t.trim()).filter(Boolean).join(" · ");
    const amount = /^([-+]?[\d,]+(\.\d+)?)( ?(MMK|THB|Ks|ကျပ်))?$/.exec(text);
    const plain = amount ? amount[1].replace(/,/g, "") : text;
    return /[",\r\n]/.test(plain) ? `"${plain.replace(/"/g, '""')}"` : plain;
  };
  const line = (cells: Element[]) => (skipLast ? cells.slice(0, -1) : cells).map(cell).join(",");
  const head = line([...table.querySelectorAll("thead th")]);
  const rows = [...table.querySelectorAll("tbody > tr")].map((tr) => [...tr.children]).filter((c) => c.length > 1).map(line);
  return "﻿" + [head, ...rows].join("\r\n") + "\r\n";
}

export function Table({ headers, children, rightAlign, csv, grid }: {
  headers: string[]; children: ReactNode; rightAlign?: number[];
  /** Rows and columns on a phone too (like Excel, scrolling sideways), instead of a card
   *  per row. */
  grid?: boolean;
  /** An Export CSV link under the table, saving the rows as shown; the file is named after
   *  the page unless a name is given. False for tables that are not a list worth saving. */
  csv?: string | false;
}) {
  // A last column with no heading holds the row's buttons (Voucher, Edit, Mark as paid…).
  const actions = headers.length > 1 && headers[headers.length - 1] === "";
  const ref = useRef<HTMLTableElement>(null);
  // On a phone each row is shown as a card (globals.css, .rtable), and each cell needs its
  // column's name beside it. The names are read from the header cells as shown, so they
  // follow the Myanmar / English switch, and are put back whenever the rows change.
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const names = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
      const heading = names.findIndex((n) => n !== "");
      table.querySelectorAll("tbody > tr").forEach((tr) => {
        [...tr.children].forEach((td, i) => {
          const name = names[i] ?? "";
          if (name && i !== heading) td.setAttribute("data-label", name); else td.removeAttribute("data-label");
          if (i === heading) td.setAttribute("data-heading", ""); else td.removeAttribute("data-heading");
        });
      });
    };
    label();
    const watch = new MutationObserver(label);
    watch.observe(table, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, []);
  // "Saved" shows on the button for a moment after the file is made.
  const [csvSaved, setCsvSaved] = useState(false);
  function exportCsv() {
    const table = ref.current;
    if (!table) return;
    setCsvSaved(true);
    setTimeout(() => setCsvSaved(false), 1800);
    const page = window.location.pathname.split("/").filter(Boolean).slice(0, 2).join("-") || "dashboard";
    const name = `${csv || page}-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(new Blob([tableToCsv(table, actions)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="min-w-0">
    <div className={cn(!grid && "rtable-wrap", "max-w-full overscroll-x-contain overflow-x-auto rounded-xl border border-gray-200/80 dark:border-gray-800")}>
      <table ref={ref} className={cn(grid ? "grid-table whitespace-nowrap" : "rtable", "w-full text-sm", actions && "has-actions")}>
        <thead>
          <tr className="border-b border-gray-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-gray-800 dark:bg-navy-900/60 dark:text-gray-400">
            {headers.map((h, i) => (
              <th key={h + i} className={cn("px-3 py-2.5 font-semibold leading-tight", rightAlign?.includes(i) && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {children}
        </tbody>
      </table>
    </div>
    {csv !== false && (
      <div className="no-print mt-2 flex justify-start sm:justify-end">
        <button type="button" onClick={exportCsv}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold shadow-sm transition-all duration-200 active:scale-95",
            csvSaved
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-gray-200 bg-white text-navy-800 hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:text-gold-300 dark:hover:border-gold-500"
          )}>
          {csvSaved ? <Check size={16} /> : <Download size={16} />}
          {csvSaved ? "Saved" : "Export CSV"}
        </button>
      </div>
    )}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{message}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-gold-500 dark:border-gray-700" />
    </div>
  );
}

// ---- toast ----
interface Toast { id: number; message: string; kind: "success" | "error" }
const ToastCtx = createContext<{ push: (m: string, k?: "success" | "error") => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: "success" | "error" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    // Every confirmation in the app already comes through here, so this is the one place
    // that makes them all audible — the counter hears the outcome without looking up.
    if (kind === "success") playSuccess();
    else playError();
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-black/5",
              t.kind === "success" ? "bg-green-600" : "bg-red-600"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-gray-600 dark:text-gray-300">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { X } from "lucide-react";
import { STATUS_COLORS } from "@/lib/format";
import { playError, playSuccess } from "@/lib/sound";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-4", className)}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, onClick, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void;
  tone?: "green" | "red" | "blue" | "amber" | "default";
}) {
  const tones: Record<string, string> = {
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    default: "text-gray-900 dark:text-gray-100",
  };
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900 sm:p-4"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums sm:text-xl", tones[tone ?? "default"])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </button>
  );
}

export function Button({ children, onClick, type = "button", variant = "primary", disabled, className, size }: {
  children: ReactNode; onClick?: () => void; type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; className?: string;
  size?: "sm" | "md";
}) {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
    secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    ghost: "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
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
          "min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:min-h-10 sm:text-sm",
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
          "min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:min-h-10 sm:text-sm",
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
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div
        className={cn(
          "max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-gray-900 sm:max-h-[92vh] sm:rounded-xl sm:p-5",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="min-w-0 pr-2 text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">{title}</h2>
          <button onClick={onClose} className="min-h-10 min-w-10 rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Table({ headers, children, rightAlign }: {
  headers: string[]; children: ReactNode; rightAlign?: number[];
}) {
  return (
    <div className="max-w-full overscroll-x-contain overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
            {headers.map((h, i) => (
              <th key={h + i} className={cn("px-3 py-2.5 font-medium", rightAlign?.includes(i) && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{message}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
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
              "pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg",
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

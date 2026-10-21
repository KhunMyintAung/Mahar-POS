"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";

export const PAGE_SIZE = 25;

export interface Paged<T> {
  rows: T[];
  page: number;
  pages: number;
  total: number;
  size: number;
  setPage: (page: number) => void;
}

/** One page of a long list, so a shop with hundreds of items or jobs is not scrolling to the
 *  bottom of the screen. The page goes back to 1 whenever resetKey changes — a new filter, a
 *  new search — without an effect, by remembering which key the page belongs to. */
export function usePaged<T>(rows: T[], resetKey: unknown = "", size = PAGE_SIZE): Paged<T> {
  const key = JSON.stringify(resetKey);
  const [state, setState] = useState({ key, page: 1 });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(state.key === key ? state.page : 1, pages);
  return {
    rows: rows.slice((page - 1) * size, page * size),
    page,
    pages,
    total: rows.length,
    size,
    setPage: (p) => setState({ key, page: Math.max(1, Math.min(p, pages)) }),
  };
}

/** The page buttons under a list: nothing when it all fits on one page. */
export function Pager<T>({ paged }: { paged: Paged<T> }) {
  if (paged.pages <= 1) return null;
  const { page, pages, total, size, setPage } = paged;
  // First, last, and the pages around this one; gaps shown as "…".
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const go = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const btn = "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <span className="text-xs text-gray-500 tabular-nums">
        {(page - 1) * size + 1}–{Math.min(page * size, total)} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)} className={cn(btn, "border-gray-200 disabled:opacity-40 dark:border-gray-700")}>
          <ChevronLeft size={16} />
        </button>
        {shown.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - shown[i - 1] > 1 && <span className="px-0.5 text-gray-400">…</span>}
            <button
              type="button"
              onClick={() => go(p)}
              className={cn(btn, p === page ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800")}
            >
              {p}
            </button>
          </span>
        ))}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)} className={cn(btn, "border-gray-200 disabled:opacity-40 dark:border-gray-700")}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/** A list shown a page at a time: renders the page's rows through children, then the page
 *  buttons. A component rather than only a hook so a page can wrap any list in place,
 *  wherever it sits, without moving hooks above its loading checks. */
export function Paginated<T>({ rows, resetKey, size, children }: {
  rows: T[];
  resetKey?: unknown;
  size?: number;
  children: (rows: T[]) => React.ReactNode;
}) {
  const paged = usePaged(rows, resetKey, size);
  return (
    <>
      {children(paged.rows)}
      <Pager paged={paged} />
    </>
  );
}

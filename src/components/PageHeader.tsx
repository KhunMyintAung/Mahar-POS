"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";

/** The top bar's slot for the page name, set by AppShell. */
export const TopBarTitle = createContext<HTMLElement | null>(null);

/** A page's name, shown in the top bar instead of a row of its own, and one compact row at the
 *  top of the page: the page's search or filters (`lead`) on the left, its buttons on the right,
 *  so the list below starts as high as it can. On a phone the row wraps, search first. */
export function PageHeader({ title, lead, children, className }: { title: ReactNode; lead?: ReactNode; children?: ReactNode; className?: string }) {
  const slot = useContext(TopBarTitle);
  return (
    <>
      {slot && createPortal(<h1 className="page-title truncate text-base font-bold text-gray-900 dark:text-gray-100">{title}</h1>, slot)}
      {(lead || children) && (
        <div className={cn("no-print flex flex-wrap items-center gap-2", className)}>
          {lead && <div className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-2">{lead}</div>}
          {children && (
            // Buttons a step smaller here, so a row of them fits beside the search.
            <div className={cn("flex flex-wrap items-center justify-end gap-1.5 [&_:is(button,a)]:min-h-9 [&_:is(button,a)]:px-3 [&_:is(button,a)]:text-sm", !lead && "ml-auto")}>
              {children}
            </div>
          )}
        </div>
      )}
    </>
  );
}

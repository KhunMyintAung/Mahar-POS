"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The top bar's slot for the page name, set by AppShell. */
export const TopBarTitle = createContext<HTMLElement | null>(null);

/** A page's name, shown in the top bar instead of a row of its own, and the page's main
 *  buttons, which stay on the page itself: one row at its top, right-aligned. */
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const slot = useContext(TopBarTitle);
  return (
    <>
      {slot && createPortal(<h1 className="page-title truncate text-base font-bold text-gray-900 dark:text-gray-100">{title}</h1>, slot)}
      {children && <div className="no-print flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </>
  );
}

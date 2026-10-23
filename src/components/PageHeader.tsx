"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The top bar's two slots, set by AppShell: the page name, and (desktop) the page's buttons. */
export const TopBarSlots = createContext<{ title: HTMLElement | null; actions: HTMLElement | null }>({ title: null, actions: null });

const WIDE = "(min-width: 1024px)";
const subscribe = (onChange: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
};

/** A page's name and its main buttons, shown in the top bar instead of a row of their own,
 *  so the page below starts with its content. On a phone the bar has no room for buttons:
 *  they stay at the top of the page, on one row. */
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const slots = useContext(TopBarSlots);
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
  const buttons = children ? <div className="flex flex-wrap items-center justify-end gap-2">{children}</div> : null;
  return (
    <>
      {slots.title && createPortal(<h1 className="page-title truncate text-base font-bold text-gray-900 dark:text-gray-100">{title}</h1>, slots.title)}
      {buttons && (wide && slots.actions ? createPortal(buttons, slots.actions) : <div className="no-print flex justify-end">{buttons}</div>)}
    </>
  );
}

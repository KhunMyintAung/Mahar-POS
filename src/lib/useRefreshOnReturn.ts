"use client";

import { useEffect } from "react";

/** Reload a page's data when the user comes back to it: another tab, or the phone app brought
 *  back from the background. A page left open there otherwise keeps the numbers it loaded,
 *  e.g. Items still showing the stock from before a purchase made since. */
export function useRefreshOnReturn(load: () => void) {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
}

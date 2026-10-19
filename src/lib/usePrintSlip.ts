"use client";

import { useEffect } from "react";

/** Marks <body> while a printable slip is in the document, for the print stylesheet.
 *
 *  Counted, so two slips mounted at once (or one replacing another) never clear the mark
 *  while one is still there. */
let mounted = 0;

export function usePrintSlip() {
  useEffect(() => {
    mounted += 1;
    document.body.classList.add("has-print-slip");
    return () => {
      mounted -= 1;
      if (mounted === 0) document.body.classList.remove("has-print-slip");
    };
  }, []);
}

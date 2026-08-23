"use client";

import { useEffect, useState } from "react";

/** Drop-in replacement for `useState(false)` on a page's create modal.
 *
 *  The floating "+" sends the user to the current section with `?new=1`, and the page
 *  opens its own create form. Reading the URL directly rather than through
 *  useSearchParams keeps every page statically rendered — useSearchParams would force a
 *  Suspense boundary and dynamic rendering on a dozen pages that otherwise need neither.
 */
export const NEW_EVENT = "wn-new";

export function useNewModal(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Deferred a tick so the open is a normal update rather than one during mount.
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("new") === "1") setOpen(true);
    }, 0);

    // Reading the URL on mount alone missed the commonest case there is: tapping "+" while
    // already on the page it creates for. That is a client-side navigation, the component
    // never remounts, and the form simply did not open. The button says so directly.
    const onNew = () => setOpen(true);
    window.addEventListener(NEW_EVENT, onNew);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(NEW_EVENT, onNew);
    };
  }, []);

  return [open, setOpen];
}

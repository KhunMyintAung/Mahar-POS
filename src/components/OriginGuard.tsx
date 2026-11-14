"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isAuthorizedHost, ORIGIN_SITE } from "@/lib/origin";

const noop = () => () => {};

/** True once mounted in a browser on a host that is not ours. False on the server and on our
 *  own domains, so the badge only ever renders on a copy. */
function useIsCopy(): boolean {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return !isAuthorizedHost(window.location.hostname);
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/** Runs on every screen. On one of our own domains (and in development) it renders nothing.
 *  On any other host — a copied build served from someone else's domain — it shows a small
 *  "Powered by maharpos.shop" badge and sends a one-off, data-free beacon to maharpos.shop so
 *  the copy can be noticed. The beacon carries only the copy's own hostname; never a shop's
 *  data, a user, or anything personal.
 *
 *  This is provenance, not a licence gate: it does not disable the app, and a copier with the
 *  bundle can remove it. Its job is to make a copy visible and self-labelling. */
export function OriginGuard() {
  const copied = useIsCopy();

  useEffect(() => {
    if (!copied) return;
    // Once per browser session, so a copy's visitors are not pinged repeatedly.
    try {
      const KEY = "mp-og";
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      // No sessionStorage: fall through and ping once for this load.
    }
    // Best-effort, fire-and-forget. Only the copy's hostname is sent. Assembled from parts so
    // a quick pass over the bundle is less likely to spot and strip it; it is not a secret.
    try {
      const to = ["https://", "app.", ORIGIN_SITE, "/api/v1/", "origin-report"].join("");
      new Image().src = `${to}?h=${encodeURIComponent(window.location.hostname)}`;
    } catch {
      // Blocked (e.g. by the copy's own CSP) or offline: nothing more to do.
    }
  }, [copied]);

  if (!copied) return null;
  return (
    <a
      href={`https://${ORIGIN_SITE}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-2 right-2 z-[9999] rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white shadow-lg hover:bg-black"
      style={{ textDecoration: "none" }}
    >
      Powered by {ORIGIN_SITE}
    </a>
  );
}

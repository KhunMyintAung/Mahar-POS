"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

/** "Continue with Google", on both the sign-in and sign-up pages — one button does both,
 *  since Google either matches an account or creates one.
 *
 *  Two ways, whichever the deployment is set up for: with a client secret, a plain link
 *  into the redirect flow; with only a client id, Google's own button, whose credential the
 *  server checks with Google before signing in. Renders nothing where neither is set up,
 *  so nobody taps a dead end.
 */

interface GoogleId {
  accounts: { id: {
    initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; auto_select?: boolean }): void;
    renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  } };
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<GoogleId> {
  const w = window as unknown as { google?: GoogleId };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => (w.google ? resolve(w.google) : reject(new Error("Google did not load"))));
    script.addEventListener("error", () => reject(new Error("Google did not load")));
  });
}

export function GoogleSignIn({ label = "Continue with Google" }: { label?: string }) {
  const [mode, setMode] = useState<{ enabled: boolean; clientId: string | null } | null>(null);
  const [error, setError] = useState("");
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Deferred a frame so the update is an ordinary one rather than during mount.
    const frame = window.requestAnimationFrame(() => {
      api<{ enabled: boolean; clientId: string | null }>("/api/v1/auth/google/status")
        .then(setMode)
        .catch(() => setMode({ enabled: false, clientId: null }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const clientId = mode?.clientId ?? null;
  useEffect(() => {
    if (!clientId || !holder.current) return;
    const el = holder.current;
    let cancelled = false;
    loadGsi().then((google) => {
      if (cancelled) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          setError("");
          api<{ redirect: string }>("/api/v1/auth/google/idtoken", { method: "POST", body: { credential } })
            .then((d) => { window.location.href = d.redirect; })
            .catch((e) => setError(e instanceof Error ? e.message : "Google sign-in failed"));
        },
      });
      google.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: el.clientWidth || 320 });
    }).catch(() => { if (!cancelled) setError("Google sign-in could not load. Check your connection."); });
    return () => { cancelled = true; };
  }, [clientId]);

  if (!mode?.enabled) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        <span className="text-xs text-gray-400">or</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </div>
      {clientId ? (
        <div ref={holder} className="flex min-h-11 w-full justify-center" />
      ) : (
        // A plain link, not fetch: this leaves the site for Google and comes back.
        <a
          href="/api/v1/auth/google/start"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          {label}
        </a>
      )}
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </>
  );
}

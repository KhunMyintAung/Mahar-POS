"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

/** "Continue with Google", on both the sign-in and sign-up pages — one button does both,
 *  since Google either matches an account or creates one.
 *
 *  Renders nothing where the deployment has no credentials, so nobody taps a dead end.
 */
export function GoogleSignIn({ label = "Continue with Google" }: { label?: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Deferred a frame so the update is an ordinary one rather than during mount.
    const frame = window.requestAnimationFrame(() => {
      api<{ enabled: boolean }>("/api/v1/auth/google/status")
        .then((d) => setEnabled(d.enabled))
        .catch(() => setEnabled(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        <span className="text-xs text-gray-400">or</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </div>
      {/* A plain link, not fetch: this leaves the site for Google and comes back. */}
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
    </>
  );
}

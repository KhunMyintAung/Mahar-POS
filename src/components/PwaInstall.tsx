"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** The event is caught by a script in the document head, because the browser fires it
 *  once and usually before this component exists. See src/app/layout.tsx. */
declare global {
  interface Window {
    __wnInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstall({ compact = false }: { compact?: boolean }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setInstalled(isStandalone());
      // Whatever the head script has already caught, before any listener below runs.
      if (window.__wnInstallPrompt) {
        setInstallPrompt(window.__wnInstallPrompt);
        setInstalled(false);
      }
    });

    // Fired by the head script when it catches the event after this point.
    const onReady = () => {
      if (!window.__wnInstallPrompt) return;
      setInstallPrompt(window.__wnInstallPrompt);
      setInstalled(false);
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      window.__wnInstallPrompt = null;
    };

    window.addEventListener("wn-install-ready", onReady);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("wn-install-ready", onReady);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;

    await fetch("/full-app", { credentials: "same-origin" });
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstalled(true);
    // A prompt can only be shown once, so drop the stored one either way.
    setInstallPrompt(null);
    window.__wnInstallPrompt = null;
  }

  if (installed || !installPrompt) return null;

  return (
    <button
      type="button"
      onClick={install}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950",
        compact ? "min-h-10 min-w-10 p-2" : "min-h-10 px-3 py-2 text-sm"
      )}
      title="Install Mahar Mini POS"
      aria-label="Install Mahar Mini POS"
    >
      <Download size={compact ? 18 : 17} />
      {!compact && <span>Install App</span>}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { LanguageSwitch } from "./LanguageProvider";
import { SoundToggle } from "./SoundToggle";
import { cn } from "./ui";

/** Dark or light, remembered on this device (the root layout applies it before paint). */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("wn-theme", next ? "dark" : "light");
    } catch {
      // Private mode: the switch still works for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn("rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800", className)}
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/** Language, sound and theme together, for the pages before signing in. */
export function PageToggles({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <LanguageSwitch className="mr-1" />
      <SoundToggle />
      <ThemeToggle />
    </div>
  );
}

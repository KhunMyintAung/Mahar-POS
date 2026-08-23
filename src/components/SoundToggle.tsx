"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, playSuccess, setMuted } from "@/lib/sound";
import { cn } from "./ui";

/** Turn the counter sounds off.
 *
 *  A beep on every scan is right at a busy counter and wrong in a quiet room, and that is
 *  not something a deployment can decide for someone — so it sits next to the theme switch
 *  where a person can reach it.
 */
export function SoundToggle({ className }: { className?: string }) {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    // Read after mount: the value lives in localStorage, which the server cannot see, and
    // rendering it directly would not match what the server sent.
    const frame = window.requestAnimationFrame(() => setMutedState(isMuted()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    // Turning it back on plays one, so it is obvious the sound works.
    if (!next) playSuccess();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
        className
      )}
      title={muted ? "Turn sounds on" : "Turn sounds off"}
      aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
      aria-pressed={muted}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

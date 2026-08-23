"use client";

/** Short tones for the counter: a beep when something lands in the cart, a chime when an
 *  action goes through.
 *
 *  The tones are generated rather than loaded. A shop counter runs on a phone with a
 *  patchy connection, and a sound file that has not downloaded is a sound that does not
 *  play at the one moment it matters — and nothing has to be added to the offline cache.
 *
 *  Never throws. Audio is not allowed before a page has been interacted with, and some
 *  devices refuse it outright; a sale must not fail because a beep could not.
 */

const MUTE_KEY = "wn-sound-muted";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    // Browsers suspend the context until a gesture; a tap on a product is that gesture,
    // but the resume only takes effect from the next call, so it is asked for every time.
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // A browser with storage blocked simply keeps the sound on.
  }
}

/** One tone. `delay` staggers the notes of a chime. */
function tone(frequency: number, startAfter: number, seconds: number, peak: number) {
  const ctx = audio();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + startAfter;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    // Ramped rather than switched on and off: a square edge clicks, and a counter hears
    // that click hundreds of times a day.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  } catch {
    // Nothing here is worth interrupting a sale for.
  }
}

/** Loud enough to carry across a shop with a customer talking over it. Kept below 1.0,
 *  where a sine starts to clip and the tone turns into a rasp. */
const LEVEL = 0.55;

/** A scanner-style beep, for an item joining the cart. */
export function playBeep() {
  if (isMuted()) return;
  // Dropped from 2kHz: small phone speakers reproduce this far better, so it sounds
  // louder at the same level rather than thin.
  tone(1600, 0, 0.09, LEVEL);
}

/** Two rising notes, for something that completed. */
export function playSuccess() {
  if (isMuted()) return;
  tone(880, 0, 0.13, LEVEL);
  tone(1320, 0.11, 0.2, LEVEL);
}

/** A low note, so a failure is not mistaken for a success by someone not looking at the
 *  screen — which at a counter is most of the time. */
export function playError() {
  if (isMuted()) return;
  tone(340, 0, 0.18, LEVEL);
  tone(250, 0.16, 0.26, LEVEL);
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The tones need an AudioContext and localStorage, neither of which exists here, so both
 *  are stood up as fakes. What is worth testing is the part that decides whether a sound
 *  happens at all — a counter that has muted the app must stay silent. */
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function sound() {
  return import("@/lib/sound");
}

describe("sound preference", () => {
  it("is on until someone turns it off", async () => {
    const { isMuted } = await sound();
    expect(isMuted()).toBe(false);
  });

  it("remembers being muted, and being turned back on", async () => {
    const { isMuted, setMuted } = await sound();
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it("stays quiet while muted", async () => {
    const { playBeep, playSuccess, playError, setMuted } = await sound();
    const created = vi.fn();
    vi.stubGlobal("AudioContext", class { constructor() { created(); } } as unknown as typeof AudioContext);
    setMuted(true);
    playBeep();
    playSuccess();
    playError();
    // Muted means no audio is even asked for, not that a silent tone is played.
    expect(created).not.toHaveBeenCalled();
  });

  it("treats storage being unavailable as not muted, and does not throw", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    const { isMuted, setMuted } = await sound();
    expect(isMuted()).toBe(false);
    expect(() => setMuted(true)).not.toThrow();
  });

  it("never throws when the device has no audio at all", async () => {
    const { playBeep, playSuccess, playError } = await sound();
    vi.stubGlobal("AudioContext", undefined);
    // A sale must not fail because a beep could not play.
    expect(() => { playBeep(); playSuccess(); playError(); }).not.toThrow();
  });
});

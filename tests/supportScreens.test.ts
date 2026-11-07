import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import screens from "../src/lib/supportScreens.json";

describe("support chat screen reference", () => {
  it("matches the app's screens as they are now", () => {
    // Throws (exit 1) when a screen changed and the file was not regenerated.
    expect(() => execFileSync(process.execPath, ["scripts/gen-support-screens.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("knows the menu and leaves out pages that are not in it", () => {
    expect(screens.menu.some((m) => m.path === "/pos")).toBe(true);
    expect(screens.screens.some((s) => s.path === "/daily-close")).toBe(false);
    expect(screens.screens.find((s) => s.path === "/pos")!.labels.length).toBeGreaterThan(20);
  });
});

describe("support chat lookups", () => {
  it("looks up a screen and finds where a word is", async () => {
    const { supportLookups } = await import("../src/lib/supportAgent");
    const pos = (await supportLookups.run("screen", { path: "/pos/" })) as { labels: string[]; menu: { name: string } };
    expect(pos.menu.name).toContain("Sales & POS");
    expect(pos.labels.length).toBeGreaterThan(20);
    const found = (await supportLookups.run("find_label", { text: "warranty" })) as { matches: { path: string }[] };
    expect(found.matches.some((m) => m.path === "/settings")).toBe(true);
    const missing = (await supportLookups.run("screen", { path: "/daily-close" })) as { error?: string };
    expect(missing.error).toBeTruthy();
  });
});

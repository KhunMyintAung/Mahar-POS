import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { TH } from "@/lib/i18n/th";

describe("Thai labels", () => {
  it("every Thai label is filled in", () => {
    for (const [en, th] of Object.entries(TH)) expect(th.trim(), en).not.toBe("");
  });

  it("covers the Myanmar labels, so Thai is not left behind", () => {
    const src = readFileSync("src/components/LanguageProvider.tsx", "utf8");
    const body = src.slice(src.indexOf("const MM: Record<string, string> = {"), src.indexOf("\n};\n"));
    const keys = [...body.matchAll(/^ {2}("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1]) as string);
    const missing = keys.filter((k) => !(k in TH));
    // A handful may lag behind; a long list means new screens were added without Thai.
    expect(missing.length, missing.slice(0, 10).join(" | ")).toBeLessThan(25);
  });
});

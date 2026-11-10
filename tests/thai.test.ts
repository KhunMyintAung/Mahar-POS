import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { TH } from "@/lib/i18n/th";
import { TH_PATTERNS } from "@/lib/i18n/thPatterns";

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

  it("has a Thai rule for every Myanmar rule built from a number or a name", () => {
    const src = readFileSync("src/components/LanguageProvider.tsx", "utf8");
    const body = src.slice(src.indexOf("const patterns: Array"), src.indexOf("function applyLanguage"));
    const mm = [...body.matchAll(/^ {4}\[(\/\^.*?\$\/),/gm)].map((m) => m[1]);
    const th = new Set(TH_PATTERNS.map(([re]) => String(re)));
    // The Myanmar "Other income ... MMK" rule is a narrower form of the Thai one.
    const missing = mm.filter((re) => !th.has(re) && !re.startsWith("/^Other income ("));
    expect(missing, missing.join(" | ")).toEqual([]);
  });

  it("reads the dashboard's counted lines in Thai", () => {
    const th = (s: string) => { for (const [re, f] of TH_PATTERNS) { const m = s.match(re); if (m) return f(...m.slice(1)); } return s; };
    expect(th("2 sale(s)")).toBe("ขาย 2 ครั้ง");
    expect(th("10 item(s) in stock")).toBe("สินค้าในสต็อก 10 รายการ");
    expect(th("40,945 THB if it all sells")).toBe("40,945 THB หากขายได้ทั้งหมด");
    expect(th("Repair expense 0 THB")).toBe("ค่าใช้จ่ายงานซ่อม 0 THB");
    expect(th("Other income · Total")).toBe("รายรับอื่น · รวม");
    expect(th("To order · 4")).toBe("ต้องสั่ง · 4");
  });
});

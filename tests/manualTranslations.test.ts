import { describe, expect, it } from "vitest";
import { MANUAL } from "@/lib/manual";
import { MANUAL_EN } from "@/lib/manualEn";
import { MANUAL_TH } from "@/lib/manualTh";
import { localGuide, manualPath } from "@/lib/manualI18n";
import { manualGuideHtml, manualIndexHtml } from "@/lib/manualHtml";

describe("user manual translations", () => {
  for (const [lang, table] of [["en", MANUAL_EN], ["th", MANUAL_TH]] as const) {
    it(`${lang}: every guide is translated, step for step`, () => {
      expect(Object.keys(table).sort()).toEqual(MANUAL.map((g) => g.slug).sort());
      for (const g of MANUAL) {
        const t = table[g.slug];
        expect(t.steps.length, g.slug).toBe(g.steps.length);
        expect((t.tips ?? []).length, g.slug).toBe((g.tips ?? []).length);
        expect(t.title.trim() && t.description.trim(), g.slug).toBeTruthy();
        for (const s of t.steps) expect(s.t.trim() && s.d.trim(), g.slug).toBeTruthy();
        expect(localGuide(g, lang).title).toBe(t.title);
      }
    });
  }

  it("gives each language its own address and points them at each other", () => {
    expect(manualPath("my", "imei-tracking")).toBe("/manual/imei-tracking");
    expect(manualPath("th")).toBe("/manual/th");
    const html = manualGuideHtml(MANUAL[1], "en");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<link rel="canonical" href="https://maharpos.shop/manual/en/' + MANUAL[1].slug + '">');
    expect(html).toContain('hreflang="th" href="https://maharpos.shop/manual/th/' + MANUAL[1].slug + '"');
    expect(html).toContain(MANUAL_EN[MANUAL[1].slug].title);
    expect(manualIndexHtml("th")).toContain('<html lang="th">');
    expect(manualIndexHtml()).toContain('<html lang="my">');
  });
});

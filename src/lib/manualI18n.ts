import { MANUAL, type ManualCategory, type ManualGuide, type ManualStep } from "./manual";
import { MANUAL_EN } from "./manualEn";
import { MANUAL_TH } from "./manualTh";

/** The manual's three languages. Myanmar is the original (manual.ts) and lives at /manual;
 *  English and Thai are translations of it, at /manual/en and /manual/th. */
export type ManualLang = "my" | "en" | "th";
export const MANUAL_LANGS: ManualLang[] = ["my", "en", "th"];
export const isTranslatedLang = (v: string): v is "en" | "th" => v === "en" || v === "th";

/** One guide's words in another language; the slug, category and order stay the original's. */
export interface ManualText { title: string; description: string; steps: ManualStep[]; tips?: string[] }

const TRANSLATIONS: Record<"en" | "th", Record<string, ManualText>> = { en: MANUAL_EN, th: MANUAL_TH };

/** A guide in the language asked for. A guide not translated yet is shown in Myanmar rather
 *  than left out, so a new guide never breaks the other languages. */
export function localGuide(g: ManualGuide, lang: ManualLang): ManualGuide {
  if (lang === "my") return g;
  const t = TRANSLATIONS[lang][g.slug];
  return t ? { ...g, title: t.title, description: t.description, steps: t.steps, tips: t.tips } : g;
}

export const localManual = (lang: ManualLang): ManualGuide[] => MANUAL.map((g) => localGuide(g, lang));

/** The address of the contents page or of one guide, in a language. */
export function manualPath(lang: ManualLang, slug?: string): string {
  return `/manual${lang === "my" ? "" : `/${lang}`}${slug ? `/${slug}` : ""}`;
}

export const CATEGORY_LABEL: Record<ManualLang, Record<ManualCategory, string>> = {
  my: { start: "စတင်ခြင်း", pos: "အရောင်းနှင့် ဝန်ဆောင်မှု", manage: "စီမံခန့်ခွဲမှု" },
  en: { start: "Getting started", pos: "Sales and services", manage: "Management" },
  th: { start: "เริ่มต้นใช้งาน", pos: "การขายและบริการ", manage: "การจัดการ" },
};

import { CATEGORY_SEP } from "./productCsv";

interface WithCategory { category?: { name: string; parentName?: string | null } | null }

/** "Accessory › Earphone" for a sub-category, "Accessory" for a main one, empty for none. */
export const categoryPath = (item: WithCategory) =>
  item.category?.parentName ? `${item.category.parentName}${CATEGORY_SEP}${item.category.name}` : item.category?.name ?? "";

/** Each main category with its sub-categories right after it, for a category picker. */
export function categoryChoices(items: WithCategory[]): string[] {
  const names = items.flatMap((item) => {
    const own = categoryPath(item);
    return own ? [own, own.split(CATEGORY_SEP)[0]] : [];
  });
  return [...new Set(names)].sort();
}

/** Picking a main category takes in everything under it; picking a sub-category, only that one. */
export function inCategoryChoice(item: WithCategory, choice: string): boolean {
  const own = categoryPath(item);
  return choice === "ALL" || own === choice || own.startsWith(choice + CATEGORY_SEP);
}

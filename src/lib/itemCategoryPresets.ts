import type { Tx } from "@/lib/prisma";

/** The item categories a phone shop starts with: the three every phone shop has. The shop
 *  adds its own and more sub-categories (Spare Parts › LCD) from there. */
export const PHONE_SHOP_ITEM_CATEGORIES = [
  "Phone",
  "Accessories",
  "Spare Parts",
] as const;

/** Sub-categories made with a preset: Phone › New and Phone › Second pick the new-phone and
 *  second-hand warranty lists at the till. */
export const PRESET_SUBCATEGORIES: Record<string, readonly string[]> = {
  Phone: ["New", "Second"],
};

/** The item categories a mini mart starts with: the shelves of a corner shop, and nothing
 *  to do with phones. */
export const MINI_MART_ITEM_CATEGORIES = [
  "Drinks",
  "Snacks",
  "Grocery",
  "Instant Food",
  "Cooking & Spices",
  "Frozen & Fresh",
  "Household",
  "Personal Care",
  "Baby Care",
  "Medicine",
  "Stationery",
] as const;

/** Item category presets per business category; none for the others yet. */
export function itemCategoryPresets(businessCategory: string | undefined): readonly string[] {
  if (businessCategory === "MOBILE_SHOP") return PHONE_SHOP_ITEM_CATEGORIES;
  if (businessCategory === "MINI_MART") return MINI_MART_ITEM_CATEGORIES;
  return [];
}

/** Add the presets this business does not have yet. A preset the shop had removed is
 *  brought back rather than duplicated. Returns how many were added or restored. */
export async function addItemCategoryPresets(tx: Tx, businessId: string, names: readonly string[]): Promise<number> {
  if (names.length === 0) return 0;
  // Top-level categories only. Matched by name without regard to case, so a shop's own
  // "phone new" is not joined by a second "Phone New".
  const existing = await tx.itemCategory.findMany({
    where: { businessId, parentId: null },
    select: { id: true, name: true, active: true },
  });
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  let changed = 0;
  for (const name of names) {
    let found = byName.get(name.toLowerCase());
    if (!found) {
      found = await tx.itemCategory.create({ data: { businessId, name }, select: { id: true, name: true, active: true } });
      changed += 1;
    } else if (!found.active) {
      await tx.itemCategory.update({ where: { id: found.id }, data: { active: true } });
      changed += 1;
    }
    // Its preset sub-categories (Phone › New, Second), the ones it does not have yet.
    const subs = PRESET_SUBCATEGORIES[name] ?? [];
    if (subs.length) {
      const have = await tx.itemCategory.findMany({ where: { businessId, parentId: found.id }, select: { id: true, name: true, active: true } });
      const haveBy = new Map(have.map((c) => [c.name.trim().toLowerCase(), c]));
      for (const sub of subs) {
        const h = haveBy.get(sub.toLowerCase());
        if (!h) { await tx.itemCategory.create({ data: { businessId, name: sub, parentId: found.id } }); changed += 1; }
        else if (!h.active) { await tx.itemCategory.update({ where: { id: h.id }, data: { active: true } }); changed += 1; }
      }
    }
  }
  return changed;
}

/** A second-hand handset category (Phone Second, Phone › Second, Used phone, ဖုန်းအဟောင်း…):
 *  its items carry a condition and battery health. */
export function isSecondHandPhone(name: string | null | undefined): boolean {
  return isPhoneCategory(name) && /(second|used|2nd|ဟောင်း|တစ်ပတ်ရစ်)/i.test(name ?? "");
}

/** Ready-made conditions to pick from; anything else can be typed. */
export const PHONE_CONDITIONS = ["Like new", "Very good", "Good", "Small scratches", "Has marks", "Screen issue", "Repaired before"];

/** A handset category (Phone New, Phone Second, ဖုန်း…): items in it keep an IMEI per unit
 *  unless the shop turns that off. Accessories and spare parts are not handsets. */
export function isPhoneCategory(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  if (!n) return false;
  if (/(case|cover|glass|charger|cable|part|accessor|battery|earphone|adapter)/.test(n)) return false;
  return /\bphone\b|ဖုန်း/.test(n);
}

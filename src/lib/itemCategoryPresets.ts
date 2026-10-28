import type { Tx } from "@/lib/prisma";

/** The item categories a phone shop starts with.
 *
 *  Named so the rest of the app reads them right: "Phone New" and "Phone Second" pick the
 *  warranty lists at the till, and the accessory names match the POS icons.
 */
export const PHONE_SHOP_ITEM_CATEGORIES = [
  "Phone New",
  "Phone Second",
  "Tablet",
  "Smart Watch",
  "Audio",
  "Chargers & Cables",
  "Power Bank",
  "Cases",
  "Glass",
  "Memory & Storage",
  "Spare Parts",
  "Accessories",
] as const;

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
    const found = byName.get(name.toLowerCase());
    if (!found) {
      await tx.itemCategory.create({ data: { businessId, name } });
      changed += 1;
    } else if (!found.active) {
      await tx.itemCategory.update({ where: { id: found.id }, data: { active: true } });
      changed += 1;
    }
  }
  return changed;
}

/** A handset category (Phone New, Phone Second, ဖုန်း…): items in it keep an IMEI per unit
 *  unless the shop turns that off. Accessories and spare parts are not handsets. */
export function isPhoneCategory(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  if (!n) return false;
  if (/(case|cover|glass|charger|cable|part|accessor|battery|earphone|adapter)/.test(n)) return false;
  return /\bphone\b|ဖုန်း/.test(n);
}

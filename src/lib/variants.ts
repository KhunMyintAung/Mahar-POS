/** Variants, the light way: an item may name the model it belongs to ("iPhone 13") and what
 *  sets it apart ("128GB · Blue"). Items with the same model are shown together; each is still
 *  an item of its own, with its own price, stock, IMEIs and SKU. */

export interface Variantable { id: string; name: string; model?: string | null; variant?: string | null }

export interface ModelGroup<T> {
  key: string;
  /** The model's name, or the item's own name when it stands alone. */
  model: string;
  items: T[];
}

const keyOf = (model: string) => model.trim().toLowerCase().replace(/\s+/g, " ");

/** Items grouped under their model, in the order the first of each group appears; an item
 *  with no model is a group of its own. */
export function groupByModel<T extends Variantable>(items: T[]): ModelGroup<T>[] {
  const groups = new Map<string, ModelGroup<T>>();
  for (const item of items) {
    const model = item.model?.trim();
    const key = model ? `m:${keyOf(model)}` : `i:${item.id}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, model: model || item.name, items: [item] });
  }
  for (const g of groups.values()) {
    if (g.items.length > 1) g.items.sort((a, b) => variantLabel(a).localeCompare(variantLabel(b), undefined, { numeric: true }));
  }
  return [...groups.values()];
}

/** What a variant is called beside its model: its variant, or else its full name. */
export function variantLabel(item: Variantable): string {
  return item.variant?.trim() || item.name;
}

/** The full name of a new variant: "iPhone 13" + "128GB Blue" → "iPhone 13 128GB Blue". */
export function variantName(model: string, variant: string): string {
  return [model.trim(), variant.trim()].filter(Boolean).join(" ");
}

/** Making up a SKU for a shop that does not keep them.
 *
 *  Plenty of counters have never written a product code in their lives and should not have
 *  to invent one to save an item. What is generated still has to be usable by hand — read
 *  off a shelf label, typed into a search box — so it is derived from the product's own
 *  name rather than being a random string.
 */

/** The letters of a name, as a SKU prefix.
 *
 *  Myanmar names give no ASCII at all, and a prefix of nothing is worse than a generic
 *  one, so those fall back to ITM and lean on the number for meaning.
 */
export function skuPrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 6) || "ITM";
}

/** A candidate SKU. `n` is what makes it unique when a prefix repeats. */
export function skuCandidate(name: string, n: number): string {
  return `${skuPrefix(name)}-${String(n).padStart(4, "0")}`;
}

/** The first candidate that is not already taken.
 *
 *  `taken` is asked rather than a list being loaded, because a shop with thousands of
 *  items should not read all of them to add one. Attempts are capped: a caller that keeps
 *  colliding has something wrong with it, and looping forever would hold a transaction
 *  open while it happened.
 */
export async function generateSku(
  name: string,
  taken: (sku: string) => Promise<boolean>,
  maxAttempts = 50
): Promise<string> {
  for (let n = 1; n <= maxAttempts; n += 1) {
    const candidate = skuCandidate(name, n);
    if (!(await taken(candidate))) return candidate;
  }
  // Nothing readable was free. A timestamp is ugly but it is always available and always
  // unique, which beats refusing to save the item.
  return `${skuPrefix(name)}-${Date.now().toString(36).toUpperCase()}`;
}

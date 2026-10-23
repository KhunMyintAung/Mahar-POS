/** A pasted order list, the way the shop sends it to a supplier — one part per line, its
 *  count last ("Vivo Y17s TL 3") — as separate parts. The count is the last word when it is a
 *  plain number (or x3 / ×3, optionally "pcs"); otherwise it is 1, so "Vivo Y33 5G" stays whole.
 *  The page shows the result to check before anything is added. */
export function parseLines(text: string): { item: string; quantity: number }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*\S)\s+[x×]?(\d{1,3})\s*(?:pcs?|ခု)?$/i);
    return m && Number(m[2]) > 0 ? { item: m[1], quantity: Number(m[2]) } : { item: l, quantity: 1 };
  });
}

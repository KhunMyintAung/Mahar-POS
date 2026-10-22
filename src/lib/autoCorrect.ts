/** Tidies phone and product names as they are typed: "iPHNe 12prnax" → "iPhone 12 Pro Max".
 *
 *  Only words it knows are touched: brand and model words are put in their proper form,
 *  and near misses of the longer ones are mended. Anything else (colours, part codes,
 *  Myanmar text, "TL", "OCA") is kept exactly as typed, so it is safe on any name field. */

/** The proper spelling of each word, keyed by its lower-case form. */
const WORDS = [
  "iPhone", "iPad", "AirPods", "Apple", "Samsung", "Galaxy", "Redmi", "Xiaomi", "POCO", "Oppo", "Realme", "Vivo",
  "Infinix", "Tecno", "Huawei", "Honor", "Nokia", "OnePlus", "Pixel", "Google", "Itel", "Motorola", "Sony", "ZTE",
  "Spark", "Camon", "Pova", "Note", "Pro", "Max", "Plus", "Mini", "Ultra", "Lite", "Prime", "Neo", "Edge", "Fold",
  "Flip", "Turbo", "Smart", "Hot", "Nova", "Reno", "Narzo", "Nord", "Watch", "Tab", "Pad", "Air",
];
const CANON = new Map(WORDS.map((w) => [w.toLowerCase(), w]));
/** Words written as one that are really two. */
const COMPOUND = new Map<string, string>([
  ["promax", "Pro Max"], ["proplus", "Pro Plus"], ["ultramax", "Ultra Max"], ["notepro", "Note Pro"],
]);
/** Short codes always in capitals. */
const UPPER = new Set(["5g", "4g", "3g", "fe", "se", "xr", "xs", "lte", "nfc", "gb", "tb"]);

/** Words long enough to mend when misspelt; short ones are only fixed when exact. */
const FUZZY = [...[...CANON.entries()].filter(([k]) => k.length >= 4), ...COMPOUND.entries()];

function distance(a: string, b: string): number {
  // Damerau–Levenshtein (adjacent swaps count as one edit: "iphnoe").
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** One alphabetic word: its proper form, a mended near miss, or itself. */
function fixWord(word: string): string {
  const low = word.toLowerCase();
  if (CANON.has(low)) return CANON.get(low)!;
  if (COMPOUND.has(low)) return COMPOUND.get(low)!;
  if (UPPER.has(low)) return low.toUpperCase();
  if (low.length < 4 || !/^[a-z]+$/.test(low)) return word;
  let best: string | null = null;
  let bestD = Infinity;
  for (const [key, proper] of FUZZY) {
    // One slip in a short word, two in a long one; and the first letter has to be right.
    const allowed = Math.max(key.length, low.length) >= 6 ? 2 : 1;
    if (key[0] !== low[0] || Math.abs(key.length - low.length) > allowed) continue;
    // Four-letter words are mended only for swapped letters ("plsu"), so "Plug" stays a plug.
    if (low.length === 4 && key.length === 4 && [...low].sort().join("") !== [...key].sort().join("")) continue;
    const dist = distance(low, key);
    if (dist <= allowed && dist < bestD) { best = proper; bestD = dist; }
  }
  return best ?? word;
}

/** A run of letters and digits: split where letters meet numbers ("12promax", "iphone12"),
 *  keep model codes in capitals ("a15" → "A15", "128gb" → "128GB"). */
function fixToken(token: string): string {
  // Model codes: A15, Y28, S23, and a trailing letter kept small the way makers write it (A05s, A3x).
  if (/^[a-z]\d{1,3}[a-z]?$/i.test(token)) return token[0].toUpperCase() + token.slice(1).toLowerCase();
  if (/^\d+(gb|tb|g)$/i.test(token)) return token.toUpperCase();
  const parts = token.match(/[a-z]+|\d+/gi);
  if (!parts || parts.join("") !== token) return token;
  if (parts.length === 1) return /^\d+$/.test(token) ? token : fixWord(token);
  const fixed = parts.map((p) => (/^\d+$/.test(p) ? p : fixWord(p)));
  // Only split the run when a part was recognised; "X6511B" is a code, not words.
  const known = parts.some((p, i) => {
    if (/^\d+$/.test(p)) return false;
    const low = p.toLowerCase();
    return fixed[i] !== p || CANON.has(low) || COMPOUND.has(low);
  });
  return known ? fixed.join(" ") : token;
}

export function autoCorrectName(text: string): string {
  if (!text) return text;
  return text
    .replace(/[A-Za-z0-9]+/g, (t) => fixToken(t))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Brand and model fields together: a brand typed into the model ("iphne 12") moves to the
 *  brand when that is empty, and a brand repeated at the start of the model is dropped. */
export function autoCorrectDevice(brand: string, model: string): { brand: string; model: string } {
  let b = autoCorrectName(brand);
  let m = autoCorrectName(model);
  const first = m.split(" ")[0];
  const isBrand = (w: string) => ["iPhone", "Samsung", "Redmi", "Xiaomi", "POCO", "Oppo", "Realme", "Vivo", "Infinix", "Tecno", "Huawei", "Honor", "Nokia", "OnePlus", "Pixel", "Itel", "Motorola", "Sony", "ZTE"].includes(w);
  if (!b && isBrand(first)) { b = first; m = m.slice(first.length).trim(); }
  else if (b && first.toLowerCase() === b.toLowerCase()) m = m.slice(first.length).trim();
  return { brand: b, model: m };
}

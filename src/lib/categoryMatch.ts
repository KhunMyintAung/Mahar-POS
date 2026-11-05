/** Finding the category a name in an import file means, so a small slip in spelling
 *  ("Accesory", "accessories", "Ear phone") lands on the category the shop already has
 *  instead of making a second one beside it.
 *
 *  Pure: no database, so it can be tested on the slips people actually make.
 */

export interface CategoryLike {
  id: string;
  name: string;
  parentId: string | null;
}

/** Case, spaces, punctuation and a plural "s" do not make a different category. */
export function normalizeCategory(name: string): string {
  let n = name.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
  if (/^[a-z0-9]+$/.test(n) && n.length > 3) {
    if (n.endsWith("ies")) n = `${n.slice(0, -3)}y`;
    else if (/(sses|xes|ches|shes)$/.test(n)) n = n.slice(0, -2);
    else if (n.endsWith("s") && !n.endsWith("ss")) n = n.slice(0, -1);
  }
  return n;
}

/** Letters added, dropped or changed to turn a into b. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** How many slips a name of this length may have and still be the same word: none for a
 *  short one (Case / Cake are different things), one for a middling one, two for a long one. */
function allowed(length: number): number {
  return length <= 4 ? 0 : length <= 8 ? 1 : 2;
}

/** The category among `candidates` that `name` means, or null for a new one. An exact match
 *  (ignoring case, spaces and plurals) wins; otherwise the one closest within a slip or two,
 *  but only when it is the single closest, since a guess between two would be a coin toss. */
export function matchCategory<T extends CategoryLike>(name: string, candidates: T[]): T | null {
  const want = normalizeCategory(name);
  if (!want) return null;
  const exact = candidates.find((c) => normalizeCategory(c.name) === want);
  if (exact) return exact;
  let best: T | null = null;
  let bestDistance = Infinity;
  let tie = false;
  for (const c of candidates) {
    const have = normalizeCategory(c.name);
    const d = distance(want, have);
    if (d > allowed(Math.min(want.length, have.length))) continue;
    if (d < bestDistance) { best = c; bestDistance = d; tie = false; }
    else if (d === bestDistance) tie = true;
  }
  return tie ? null : best;
}

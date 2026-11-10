/** Search by words, in any order: every word typed must appear somewhere in the text. A part
 *  named for several phones ("Oppo A15/A16k/Realme C12/C15/C11") is found by "realme c15" or
 *  "oppo a16k", which as one phrase it does not contain. */

export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** True when each word of the query is in one of the texts (empty query: everything). */
export function matchesWords(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Search by words, in any order: every word typed must appear somewhere in the text. A part
 *  named for several phones ("Oppo A15/A16k/Realme C12/C15/C11") is found by "realme c15" or
 *  "oppo a16k", which as one phrase it does not contain.
 *
 *  Spaces and marks inside a model name do not matter either: "note9" finds "Redmi Note 9 5G",
 *  and "a16k" finds "A16 K". */

export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Letters and digits only: "Note 9-5G" → "note95g". */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The ways a typed word may be written in a saved name, for a database "contains" search,
 *  which cannot skip spaces: "note9" is also looked for as "note 9", "note-9" and "note.9". */
export function wordForms(word: string): string[] {
  const w = word.toLowerCase();
  const forms = new Set([w]);
  // A space where letters meet digits ("note9" → "note 9", "9pro" → "9 pro").
  const parts = w.split(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u);
  if (parts.length > 1) for (const sep of [" ", "-", "."]) forms.add(parts.join(sep));
  return [...forms];
}

/** True when each word of the query is in one of the texts (empty query: everything). */
export function matchesWords(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  const flat = compact(hay);
  return words.every((w) => hay.includes(w) || (compact(w) !== "" && flat.includes(compact(w))));
}

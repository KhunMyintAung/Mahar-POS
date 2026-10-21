/** IMEIs as typed or scanned into a box: one per line, or separated by spaces or commas.
 *  Spaces inside a number are not supported, since a scanner never sends them. */
export function splitImeis(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.replace(/-/g, "").toUpperCase())
    .filter(Boolean);
}

/** The same IMEI typed twice in one box. */
export function duplicateImei(list: string[]): string | null {
  const seen = new Set<string>();
  for (const i of list) {
    if (seen.has(i)) return i;
    seen.add(i);
  }
  return null;
}

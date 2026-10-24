/** Which repairs a spare part fits, by the model codes in the part's name.
 *
 *  A part is named by the phones it fits — "Vivo Y28 4G/Y29/Y19s 4G", "iPhone 13 Screen" — so
 *  its model codes are read out of it: words with letters and digits (Y28, Y19s, 12C), and a
 *  number after a word (iPhone 13 → iphone13, Note 12 → note12). What only describes the part
 *  is left out: network (4G, 5G) and sizes (128GB, 5000mAh). These are suggestions: the
 *  cashier still picks the repair. */

const SKIP = /^(\d+g|\d+(gb|tb|mb|mah|w|mm|inch))$/;

export function partModelCodes(name: string): string[] {
  const words = name.toLowerCase().split(/[\s/,|+()]+/).filter(Boolean);
  const codes: string[] = [];
  words.forEach((w, i) => {
    if (SKIP.test(w)) return;
    if (/[a-z]/.test(w) && /\d/.test(w)) codes.push(w.replace(/-/g, ""));
    else if (/^\d+$/.test(w) && i > 0 && /^[a-z]+$/.test(words[i - 1])) codes.push(`${words[i - 1]}${w}`);
  });
  return [...new Set(codes)];
}

/** True when the repair's phone carries one of the part's codes, as a whole number: Y2 does
 *  not fit a Y28, while Y28 fits "Vivo Y28" and "Vivo Y28 4G". */
export function repairFitsPart(device: { deviceBrand: string; deviceModel: string }, codes: string[]): boolean {
  if (!codes.length) return false;
  // "Vivo Y28 4G" → "vivoy28": the network and sizes go, as in the part's name.
  const phone = `${device.deviceBrand} ${device.deviceModel}`.toLowerCase().split(/[\s/-]+/).filter((w) => w && !SKIP.test(w)).join("");
  return codes.some((code) => {
    for (let at = phone.indexOf(code); at >= 0; at = phone.indexOf(code, at + 1)) {
      if (!/\d/.test(phone[at + code.length] ?? "")) return true;
    }
    return false;
  });
}

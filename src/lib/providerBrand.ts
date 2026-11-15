// Myanmar telecoms, banks and mobile-wallet providers, each given a distinct colour and a
// short label, so a wallet or a biller named after one is told apart at a glance and the
// wrong one is not picked. These are our own colour tokens and plain text — not the
// providers' own logos — so nothing copyrighted is shipped.
//
// Matching is by name: a wallet called "KBZ Pay" or a biller called "MPT" lights up with the
// right colour. Anything unrecognised falls back to its initials on a colour picked from its
// name, so even a shop's own custom wallet still gets a steady, distinct chip.

export interface Brand {
  /** Short text shown in the chip (2–4 chars). */
  label: string;
  /** Chip background; text colour is chosen for contrast from `dark`. */
  color: string;
  /** True when the colour is light and needs dark text (e.g. Wave's yellow). */
  dark?: boolean;
  /** Cash: shown as a banknote mark rather than letters. */
  cash?: boolean;
  kind: "telecom" | "bank" | "wallet";
}

/** Each entry: the brand, and the lower-case needles that name it. First match wins, so more
 *  specific names (KBZ Pay) come before looser ones (KBZ). */
const TABLE: { brand: Brand; needles: string[] }[] = [
  // Mobile wallets (checked before their banks, since "KBZ Pay" contains "KBZ").
  { brand: { label: "KPay", color: "#1657b0", kind: "wallet" }, needles: ["kbzpay", "kbz pay", "kpay", "k pay"] },
  { brand: { label: "Wave", color: "#ffd21e", dark: true, kind: "wallet" }, needles: ["wavepay", "wave pay", "wave money", "wavemoney", "wave"] },
  { brand: { label: "AYAPay", color: "#d81e2c", kind: "wallet" }, needles: ["ayapay", "aya pay"] },
  { brand: { label: "CBPay", color: "#13294b", kind: "wallet" }, needles: ["cbpay", "cb pay"] },
  { brand: { label: "OK$", color: "#1a9e4b", kind: "wallet" }, needles: ["ok dollar", "okdollar", "ok$", "ok $"] },
  { brand: { label: "OnePay", color: "#0098da", kind: "wallet" }, needles: ["onepay", "one pay"] },
  { brand: { label: "MPitesan", color: "#e8551f", kind: "wallet" }, needles: ["mpitesan", "m-pitesan", "m pitesan"] },
  { brand: { label: "TrueMoney", color: "#ea1b25", kind: "wallet" }, needles: ["truemoney", "true money"] },
  // Telecoms.
  { brand: { label: "MPT", color: "#f2a900", dark: true, kind: "telecom" }, needles: ["mpt"] },
  { brand: { label: "Ooredoo", color: "#ed1c24", kind: "telecom" }, needles: ["ooredoo", "oredoo"] },
  { brand: { label: "ATOM", color: "#6a2c91", kind: "telecom" }, needles: ["atom", "telenor"] },
  { brand: { label: "Mytel", color: "#00954c", kind: "telecom" }, needles: ["mytel", "my tel"] },
  // Banks.
  { brand: { label: "KBZ", color: "#0f5aa6", kind: "bank" }, needles: ["kbz"] },
  { brand: { label: "AYA", color: "#d81e2c", kind: "bank" }, needles: ["aya"] },
  { brand: { label: "CB", color: "#13294b", kind: "bank" }, needles: ["cb bank", "cbbank", "co-operative", "cb"] },
  { brand: { label: "Yoma", color: "#0096d6", kind: "bank" }, needles: ["yoma"] },
  { brand: { label: "AGD", color: "#1a7f3c", kind: "bank" }, needles: ["agd"] },
  { brand: { label: "UAB", color: "#00857a", kind: "bank" }, needles: ["uab"] },
  { brand: { label: "A Bank", color: "#5b2a86", kind: "bank" }, needles: ["a bank", "ayeyarwady bank"] },
  { brand: { label: "MAB", color: "#c8102e", kind: "bank" }, needles: ["mab", "myanmar apex"] },
  { brand: { label: "GTB", color: "#0b6b3a", kind: "bank" }, needles: ["gtb", "global treasure"] },
];

/** A steady colour for an unrecognised name, so its chip stays the same every time. */
const FALLBACK = ["#475569", "#9333ea", "#0891b2", "#c2410c", "#4d7c0f", "#be123c", "#1d4ed8", "#a16207"];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
}

/** Initials for a name with no known brand: first letters of its first two words, or its
 *  first two characters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

/** The brand chip for a wallet or biller name: a known Myanmar provider, or initials on a
 *  steady colour. `cash` names get a plain money chip rather than letters. */
export function brandFor(name: string): Brand {
  const n = (name || "").toLowerCase();
  if (/\b(cash|ngwe)\b/.test(n) || n.includes("ငွေသား")) {
    return { label: "", color: "#1a9e4b", cash: true, kind: "wallet" };
  }
  for (const { brand, needles } of TABLE) {
    if (needles.some((w) => n.includes(w))) return brand;
  }
  return { label: initials(name), color: hashColor(name || "?"), kind: "wallet" };
}

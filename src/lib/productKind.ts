/** What sort of thing a product is, guessed from its name and category, so the POS can
 *  show a fitting picture without anyone uploading one.
 *
 *  Order matters: the more specific accessories are checked before "phone", because a
 *  "Phone Case - Redmi Note 13" is a case and a "Vivo charger" is a charger, even though
 *  both name a phone brand.
 */

export type ProductKind =
  | "earphone" | "charger" | "cable" | "battery" | "cover" | "speaker" | "watch"
  | "tablet" | "computer" | "storage" | "mouse" | "camera" | "gaming" | "repair"
  | "phone" | "accessory" | "product";

const RULES: [ProductKind, string[]][] = [
  ["earphone", ["earphone", "earbud", "headphone", "headset", "airpod", "နားကြပ်"]],
  ["charger", ["charger", "adapter", "charging head", "power bank", "powerbank", "အားသွင်း"]],
  ["cable", ["cable", "type-c", "type c", "lightning", "micro usb", "ကြိုး"]],
  ["battery", ["battery", "ဘက်ထရီ"]],
  ["cover", ["cover", "case", "casing", "bumper", "screen protector", "tempered", "glass", "မှန်", "ကာဗာ"]],
  ["speaker", ["speaker", "စပီကာ"]],
  ["watch", ["smart watch", "smartwatch", "watch", "band", "နာရီ"]],
  ["tablet", ["tablet", "ipad", "galaxy tab"]],
  ["computer", ["laptop", "notebook", "computer", "desktop", "macbook", "ကွန်ပျူတာ"]],
  ["storage", ["memory card", "sd card", "micro sd", "flash drive", "usb drive", "pendrive", "hard disk", "ssd"]],
  ["mouse", ["mouse", "keyboard", "မောက်စ်"]],
  ["camera", ["camera", "webcam", "ကင်မရာ"]],
  ["gaming", ["gamepad", "controller", "joystick", "gaming"]],
  ["repair", ["spare part", "repair part", "lcd", "display", "flex", "back glass", "အပိုပစ္စည်း"]],
  ["phone", [
    "phone", "mobile", "smartphone", "handset", "iphone", "redmi", "xiaomi", "poco",
    "samsung", "galaxy", "oppo", "vivo", "realme", "honor", "huawei", "tecno", "infinix",
    "nokia", "itel", "oneplus", "pixel", "ဖုန်း",
  ]],
  ["accessory", ["accessories", "accessory", "gadget", "အက်ဆက်စရီ"]],
];

export function productKind(item: { name: string; category?: { name: string } | null }): ProductKind {
  const text = `${item.category?.name ?? ""} ${item.name}`.toLowerCase();
  for (const [kind, words] of RULES) {
    if (words.some((word) => text.includes(word))) return kind;
  }
  return "product";
}

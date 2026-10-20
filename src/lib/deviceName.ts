/** Splitting "iPhone 13 Pro Max", typed into the Brand box, into brand and model.
 *
 *  People type the whole name where the brand goes. When the text starts with a brand we
 *  know — from this list or from the shop's own past jobs — the rest belongs in Model.
 */

export const KNOWN_BRANDS = [
  "Apple", "iPhone", "iPad", "Samsung", "Galaxy", "Xiaomi", "Redmi", "Poco", "Oppo", "Vivo",
  "Realme", "OnePlus", "Honor", "Huawei", "Tecno", "Infinix", "Itel", "Nokia", "Motorola",
  "Moto", "Google", "Pixel", "Sony", "Asus", "Lenovo", "ZTE", "Meizu", "Nothing",
];

/** The brand and the rest, or null when the text does not start with a known brand followed
 *  by something more. The brand keeps the casing of the list ("IPHONE 13" → "iPhone"). */
export function splitBrandModel(text: string, extraBrands: string[] = []): { brand: string; model: string } | null {
  const value = text.replace(/\s+/g, " ").trimStart();
  if (!value.includes(" ")) return null;
  // Longest first, so a shop's own "Google Pixel" wins over "Google".
  const brands = [...new Set([...extraBrands.map((b) => b.trim()).filter(Boolean), ...KNOWN_BRANDS])]
    .sort((a, b) => b.length - a.length);
  const lower = value.toLowerCase();
  for (const brand of brands) {
    const b = brand.toLowerCase();
    if (lower.startsWith(`${b} `) && value.length > b.length + 1) {
      const model = value.slice(b.length + 1);
      if (model.trim() === "") return null;
      return { brand, model };
    }
  }
  return null;
}

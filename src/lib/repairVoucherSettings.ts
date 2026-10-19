/** What a shop can set up for its repair voucher: the number format and the printed text.
 *
 *  Stored as the "repair_voucher" setting. Kept free of server imports so the voucher and
 *  the settings page can share the defaults.
 */

export interface RepairVoucherSettings {
  /** Letters in front of the number, e.g. "MS" gives MS001. Empty keeps the RPR-000001 style. */
  prefix: string;
  /** Minimum digits; the number grows past it rather than wrapping (MS999, MS1000). */
  digits: number;
  /** A line under the shop name, e.g. what the shop does. */
  tagline: string;
  /** The warnings printed on the voucher, one per line. */
  terms: string[];
  /** Printed under the QR code. */
  qrCaption: string;
}

export const DEFAULT_REPAIR_TERMS = [
  "အရေးကြီး ဆင်းကဒ်များ မိမိကိုယ်တိုင် သိမ်းဆည်းရန်။",
  "ဖုန်းအတွင်း အရေးကြီးဖိုင်၊ အဆက်အသွယ်များ မပြင်မီ ကြိုပြောရန်။",
  "ဖုန်းကာဗာများနှင့် အခြားဆက်စပ်ပစ္စည်းပါလာပါက ပြန်တောင်းယူရန်။",
  "အထက်ပါအကြောင်းကြောင့် ပျောက်ဆုံးပျက်စီးပါက တာဝန်မယူပါ။",
  "တစ်လကျော် အပ်နှံပစ္စည်းများ တာဝန်မယူပါ။",
  "ဖုန်းလာရွေးသူမှာ ကိုယ်တိုင်မဟုတ်ပါက လက်ခံ Voucher ပါမှသာ ဖုန်းထုတ်ပေးပါသည်။",
];

export const DEFAULT_REPAIR_VOUCHER: RepairVoucherSettings = {
  prefix: "",
  digits: 3,
  tagline: "",
  terms: DEFAULT_REPAIR_TERMS,
  qrCaption: "QR ဖတ်ပြီး ပြင်ဆင်မှုအခြေအနေ ကြည့်နိုင်ပါသည်",
};

export const PREFIX_PATTERN = /^[A-Za-z0-9]{0,6}$/;

/** Read a stored value, keeping anything sensible and defaulting the rest. */
export function parseRepairVoucherSettings(value: unknown): RepairVoucherSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : undefined);
  const prefix = str(v.prefix, 6);
  const digits = Number(v.digits);
  const terms = Array.isArray(v.terms)
    ? v.terms.map((t) => str(t, 200)).filter((t): t is string => Boolean(t)).slice(0, 12)
    : undefined;
  return {
    prefix: prefix !== undefined && PREFIX_PATTERN.test(prefix) ? prefix.toUpperCase() : DEFAULT_REPAIR_VOUCHER.prefix,
    digits: Number.isInteger(digits) && digits >= 1 && digits <= 8 ? digits : DEFAULT_REPAIR_VOUCHER.digits,
    tagline: str(v.tagline, 120) ?? DEFAULT_REPAIR_VOUCHER.tagline,
    terms: terms ?? DEFAULT_REPAIR_VOUCHER.terms,
    qrCaption: str(v.qrCaption, 120) ?? DEFAULT_REPAIR_VOUCHER.qrCaption,
  };
}

export function formatVoucherNo(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

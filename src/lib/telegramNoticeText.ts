/** Telegram notices in the shop's language.
 *
 *  The notices (telegramNotify.ts, the daily report) are written in Myanmar, from a fixed
 *  set of labels around the shop's own names and numbers. For a shop whose main currency
 *  stands for another language (THB Thai, USD English) the labels are put into that
 *  language just before sending; a Myanmar shop's notices are sent exactly as written.
 *
 *  A label added to a notice needs a line here, and tests/telegramNoticeText.test.ts fails
 *  until it has one.
 */

import type { AppLanguage } from "@/lib/currency";
import { REPAIR_STATUSES, REPAIR_STATUS_MM } from "@/lib/repairStatus";
import { VOUCHER_TEXT } from "@/lib/repairVoucherText";

type Lang = Exclude<AppLanguage, "mm">;
type Rule = [RegExp, Record<Lang, string>];

/** Lines whose word order changes, so the names in them have to be moved. */
const RULES: Rule[] = [
  [/…နောက်ထပ် (\d+) မျိုး/g, { en: "…and $1 more", th: "…อีก $1 รายการ" }],
  [/^(.+) ← ငွေသား · (.+) မှ လွဲ$/gm, { en: "$1 ← cash · sent from $2", th: "$1 ← เงินสด · โอนจาก $2" }],
  [/^(.+) ထဲ ဝင် · (.+) မှ ငွေသား ပေး$/gm, { en: "Into $1 · cash paid from $2", th: "เข้า $1 · จ่ายเงินสดจาก $2" }],
  [/ပြင်ဆင်မှု လက်ခံ: (\d+) · ပြီး: (\d+)/g, { en: "Repairs taken in: $1 · finished: $2", th: "รับซ่อม: $1 · เสร็จ: $2" }],
  [/ · ခ: /g, { en: " · Fee: ", th: " · ค่าบริการ: " }],
  [/ · ကျန် /g, { en: " · due ", th: " · ค้าง " }],
  [/ · စရံ /g, { en: " · deposit ", th: " · มัดจำ " }],
  [/ · အသစ်$/gm, { en: " · new", th: " · ใหม่" }],
];

/** Myanmar label, English, Thai. Longer labels are tried first, so one that contains
 *  another ("အခြား ဝင်ငွေ" and "ဝင်ငွေ") is never cut in half. */
const LABELS: [string, string, string][] = [
  ["မှတ်ချက်:", "Note:", "หมายเหตุ:"],
  ["လုပ်သူ:", "By:", "โดย:"],
  ["စုစုပေါင်း:", "Total:", "รวม:"],
  ["အမြတ်:", "Profit:", "กำไร:"],
  ["အရောင်း", "Sale", "ขาย"],
  ["ဘေလက်ကျန် ဝယ်", "Top-up balance bought", "ซื้อยอดเติมเงิน"],
  ["ဖုန်းဘေ ရောင်း", "Top-up sold", "ขายเติมเงิน"],
  ["ဘေလက်ကျန် ပြင်", "Top-up balance adjusted", "ปรับยอดเติมเงิน"],
  ["လက်ရှိ ဘေလက်ကျန်:", "Balance now:", "ยอดคงเหลือ:"],
  ["ဘေဝယ်", "Top-up bought", "ซื้อยอดเติมเงิน"],
  ["ဖုန်းဘေ", "Top-up", "เติมเงิน"],
  ["ဘေ:", "Top-up:", "เติมเงิน:"],
  ["ငွေသား:", "Cash:", "เงินสด:"],
  ["ပမာဏ:", "Amount:", "จำนวน:"],
  ["ငွေလွဲပေး", "Transfer for a customer", "โอนเงินให้ลูกค้า"],
  ["ငွေထုတ်ပေး", "Cash-out for a customer", "ถอนเงินให้ลูกค้า"],
  ["ငွေလွှဲ", "Transfer", "โอนเงิน"],
  ["ငွေထုတ်", "Withdrawal", "ถอนเงิน"],
  ["ဝင်ငွေ စုစုပေါင်း:", "Total income:", "รวมรายรับ:"],
  ["ထွက်ငွေ စုစုပေါင်း:", "Total expense:", "รวมรายจ่าย:"],
  ["အခြား ဝင်ငွေ", "Other income", "รายรับอื่น"],
  ["အခြား ထွက်ငွေ", "Other expense", "รายจ่ายอื่น"],
  ["ဝင်ငွေ", "Income", "รายรับ"],
  ["ထွက်ငွေ", "Expense", "รายจ่าย"],
  ["အကြွေး ကောက်ပြီး", "Credit collected", "รับชำระหนี้แล้ว"],
  ["ပေးရန်ငွေ ချေပြီး", "Payable paid", "จ่ายเจ้าหนี้แล้ว"],
  ["အကြွေးသစ်", "New credit", "ลูกหนี้ใหม่"],
  ["ပြန်ဖျက်ပြီး", "reversed", "ยกเลิกแล้ว"],
  ["အကြောင်းရင်း:", "Reason:", "เหตุผล:"],
  ["ပြင်ဆင်မှု", "Repair", "งานซ่อม"],
  ["အခြေအနေ:", "Status:", "สถานะ:"],
  ["ယခုပေး:", "Paid now:", "ชำระตอนนี้:"],
  ["လက်ကျန်:", "Left:", "คงเหลือ:"],
  ["Online အော်ဒါ", "Online order", "ออเดอร์ออนไลน์"],
  // Stock movement reasons.
  ["ပြင်ဆင်မှုတွင် သုံး", "Used for repair", "ใช้ในงานซ่อม"],
  ["ပျက်စီး", "Damaged", "ชำรุด"],
  ["အရေအတွက် ပြင်ဆင်", "Count correction", "แก้ไขจำนวน"],
  ["ပေးသွင်းသူထံ ပြန်ပေး", "Returned to supplier", "คืนผู้จำหน่าย"],
  ["Stock ထဲ ပြန်ထည့်", "Returned back to stock", "คืนเข้าสต็อก"],
  ["Stock အဝင်", "Stock in", "รับเข้าสต็อก"],
  ["Stock ပြင်ဆင်", "Stock adjustment", "ปรับสต็อก"],
  ["အခြား", "Other", "อื่นๆ"],
  // The daily report.
  ["နေ့စဉ် အစီရင်ခံစာ", "Daily report", "รายงานประจำวัน"],
  ["ဝန်ဆောင်မှု", "Service", "บริการ"],
  ["အသားတင် အမြတ်", "Net profit", "กำไรสุทธิ"],
  ["အသားတင် အရှုံး", "Net loss", "ขาดทุนสุทธิ"],
  ["လက်ရှိ Wallet များ:", "Wallets now:", "กระเป๋าเงินตอนนี้:"],
  ["ဖောက်သည် အကြွေး:", "Customers owe:", "ลูกหนี้ค้างชำระ:"],
  ["ပေးသွင်းသူ ပေးရန်:", "Owed to suppliers:", "ค้างจ่ายผู้จำหน่าย:"],
  // Repair statuses, as on the voucher. "ပေးပြီး" (paid) comes after them: it is the tail
  // of "ပြန်ပေးပြီး" (handed back).
  ...REPAIR_STATUSES.map((s): [string, string, string] => [REPAIR_STATUS_MM[s], VOUCHER_TEXT.en.statuses[s], VOUCHER_TEXT.th.statuses[s]]),
  ["ပေးပြီး", "paid", "ชำระแล้ว"],
];

const BY_LENGTH = [...LABELS].sort((a, b) => b[0].length - a[0].length);

/** A notice written in Myanmar, in the shop's language. */
export function translateNotice(text: string, language: AppLanguage): string {
  if (language === "mm") return text;
  let out = text;
  for (const [pattern, to] of RULES) out = out.replace(pattern, to[language]);
  const col = language === "en" ? 1 : 2;
  for (const row of BY_LENGTH) out = out.split(row[0]).join(row[col]);
  return out;
}

/** Repair amounts are written "50,000 Ks"; in a THB or USD shop they are in that currency. */
export function inShopUnits(text: string, currency: string): string {
  return currency === "MMK" ? text : text.replace(/(\d) Ks\b/g, `$1 ${currency}`);
}

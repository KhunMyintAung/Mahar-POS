/** The words on a repair voucher and on the customer's status page, in each language a shop
 *  can hand them out in. The voucher is for the customer, so it follows the shop (its main
 *  currency, or the language picked in Settings → Repair voucher), not whichever language
 *  the member of staff at the counter has the app in.
 *
 *  Kept free of server and browser imports: the voucher, the print window, the settings
 *  page and the status page all read it.
 */

import type { AppLanguage } from "@/lib/currency";
import { REPAIR_STATUS_LABELS, REPAIR_STATUS_MM, type RepairStatus } from "@/lib/repairStatus";

export interface VoucherText {
  voucherTitle: string;
  receiptTitle: string;
  /** In the box on a receipt: the phone has gone home. */
  collected: string;
  /** A second, smaller line in that box, before the date ("" for none). */
  collectedSub: string;
  voucherNo: string;
  receivedDate: string;
  deliveredDate: string;
  name: string;
  phone: string;
  device: string;
  imei: string;
  problem: string;
  accessories: string;
  status: string;
  charge: string;
  estimated: string;
  paid: string;
  deposit: string;
  balance: string;
  settled: string;
  /** In place of a charge that is not known yet. */
  toConfirm: string;
  notice: string;
  thanks: string;
  receiver: string;
  collector: string;
  /** Printed when a shop has removed every warning. */
  keep: string;
  statuses: Record<RepairStatus, string>;
  /** The warnings and QR caption a shop starts with. */
  terms: string[];
  qrCaption: string;
}

const MM: VoucherText = {
  voucherTitle: "Repair Voucher",
  receiptTitle: "Repair Receipt · ပြေစာ",
  collected: "✔ ဖုန်းရွေးယူပြီး",
  collectedSub: "Collected",
  voucherNo: "ဘောက်ချာနံပါတ်",
  receivedDate: "လက်ခံရက်",
  deliveredDate: "ပြန်ပေးရက်",
  name: "နာမည်",
  phone: "ဖုန်းနံပါတ်",
  device: "ဖုန်း",
  imei: "IMEI",
  problem: "ပြင်ရန်",
  accessories: "ပါလာသည်",
  status: "အခြေအနေ",
  charge: "ကျသင့်ငွေ",
  estimated: "ခန့်မှန်းကျသင့်ငွေ",
  paid: "ပေးပြီး",
  deposit: "စရံငွေ",
  balance: "ကျန်ငွေ",
  settled: "✔ ရှင်းပြီး",
  toConfirm: "စစ်ဆေးပြီးမှ အတည်ပြုပါမည်",
  notice: "⚠ သတိပြုရန် ⚠",
  thanks: "ကျေးဇူးတင်ပါသည်",
  receiver: "လက်ခံသူ",
  collector: "ရွေးယူသူ",
  keep: "Please keep this voucher.",
  statuses: REPAIR_STATUS_MM as Record<RepairStatus, string>,
  terms: [
    "အရေးကြီး ဆင်းကဒ်များ မိမိကိုယ်တိုင် သိမ်းဆည်းရန်။",
    "ဖုန်းအတွင်း အရေးကြီးဖိုင်၊ အဆက်အသွယ်များ မပြင်မီ ကြိုပြောရန်။",
    "ဖုန်းကာဗာများနှင့် အခြားဆက်စပ်ပစ္စည်းပါလာပါက ပြန်တောင်းယူရန်။",
    "အထက်ပါအကြောင်းကြောင့် ပျောက်ဆုံးပျက်စီးပါက တာဝန်မယူပါ။",
    "တစ်လကျော် အပ်နှံပစ္စည်းများ တာဝန်မယူပါ။",
    "ဖုန်းလာရွေးသူမှာ ကိုယ်တိုင်မဟုတ်ပါက လက်ခံ Voucher ပါမှသာ ဖုန်းထုတ်ပေးပါသည်။",
  ],
  qrCaption: "QR ဖတ်ပြီး ပြင်ဆင်မှုအခြေအနေ ကြည့်နိုင်ပါသည်",
};

const EN: VoucherText = {
  voucherTitle: "Repair Voucher",
  receiptTitle: "Repair Receipt",
  collected: "✔ Collected",
  collectedSub: "",
  voucherNo: "Voucher no.",
  receivedDate: "Taken in",
  deliveredDate: "Handed back",
  name: "Name",
  phone: "Phone",
  device: "Device",
  imei: "IMEI / Serial",
  problem: "Problem",
  accessories: "Came with",
  status: "Status",
  charge: "Charge",
  estimated: "Estimated charge",
  paid: "Paid",
  deposit: "Deposit",
  balance: "Balance",
  settled: "✔ Paid in full",
  toConfirm: "To be confirmed after checking",
  notice: "⚠ Please note ⚠",
  thanks: "Thank you",
  receiver: "Received by",
  collector: "Collected by",
  keep: "Please keep this voucher.",
  statuses: REPAIR_STATUS_LABELS,
  terms: [
    "Please take out your SIM cards and keep them yourself.",
    "Tell us before the repair about important files or contacts on the phone.",
    "Ask for your phone cover and any other accessories back.",
    "We are not responsible for loss or damage arising from the above.",
    "We are not responsible for devices left with us for more than one month.",
    "If someone else collects the phone, it is handed over only with this voucher.",
  ],
  qrCaption: "Scan the QR to check your repair status",
};

const TH: VoucherText = {
  voucherTitle: "ใบรับซ่อม",
  receiptTitle: "ใบเสร็จค่าซ่อม",
  collected: "✔ รับเครื่องคืนแล้ว",
  collectedSub: "",
  voucherNo: "เลขที่ใบรับ",
  receivedDate: "วันที่รับเครื่อง",
  deliveredDate: "วันที่คืนเครื่อง",
  name: "ชื่อ",
  phone: "เบอร์โทร",
  device: "เครื่อง",
  imei: "IMEI",
  problem: "อาการ",
  accessories: "อุปกรณ์ที่มาด้วย",
  status: "สถานะ",
  charge: "ค่าซ่อม",
  estimated: "ค่าซ่อมโดยประมาณ",
  paid: "ชำระแล้ว",
  deposit: "มัดจำ",
  balance: "ยอดค้างชำระ",
  settled: "✔ ชำระครบแล้ว",
  toConfirm: "จะแจ้งราคาหลังตรวจเช็ก",
  notice: "⚠ ข้อควรทราบ ⚠",
  thanks: "ขอบคุณที่ใช้บริการ",
  receiver: "ผู้รับเครื่อง",
  collector: "ผู้มารับเครื่อง",
  keep: "กรุณาเก็บใบรับนี้ไว้",
  statuses: {
    RECEIVED: "รับเครื่องแล้ว",
    CHECKING: "กำลังตรวจเช็ก",
    IN_PROGRESS: "กำลังซ่อม",
    WAITING_PARTS: "รออะไหล่",
    DONE: "ซ่อมเสร็จแล้ว",
    CANNOT_REPAIR: "ซ่อมไม่ได้",
    DELIVERED: "คืนเครื่องแล้ว",
    CANCELLED: "ยกเลิกแล้ว",
  },
  terms: [
    "กรุณาถอดซิมการ์ดและเก็บไว้เอง",
    "หากมีไฟล์หรือรายชื่อติดต่อสำคัญในเครื่อง กรุณาแจ้งก่อนซ่อม",
    "หากมีเคสหรืออุปกรณ์เสริมมาด้วย กรุณาขอรับคืน",
    "ทางร้านไม่รับผิดชอบต่อการสูญหายหรือเสียหายจากเหตุข้างต้น",
    "ทางร้านไม่รับผิดชอบเครื่องที่ฝากไว้เกิน 1 เดือน",
    "หากผู้มารับไม่ใช่เจ้าของเครื่อง ต้องนำใบรับซ่อมมาด้วยจึงจะรับเครื่องได้",
  ],
  qrCaption: "สแกน QR เพื่อดูสถานะการซ่อม",
};

export const VOUCHER_TEXT: Record<AppLanguage, VoucherText> = { mm: MM, en: EN, th: TH };

/** The Myanmar slip as the counter printer has always printed it: these labels in English.
 *  Kept so a shop already printing vouchers sees no change on paper. */
const MM_PRINT: Partial<VoucherText> = {
  collectedSub: "COLLECTED",
  phone: "ဖုန်း",
  device: "Device",
  imei: "IMEI / Serial",
  problem: "Problem",
  accessories: "Accessories",
  status: "Status",
  charge: "Charge",
  estimated: "Estimated",
  paid: "Paid",
  deposit: "Deposit",
  balance: "Balance",
};

/** The words for the on-screen voucher, or for the slip sent to the printer. */
export function voucherText(language: AppLanguage | undefined, use: "screen" | "print" = "screen"): VoucherText {
  const lang = language ?? "mm";
  return lang === "mm" && use === "print" ? { ...MM, ...MM_PRINT } : VOUCHER_TEXT[lang];
}

/** The customer's status page (the voucher's QR). */
export interface TrackText {
  title: string;
  intro: string;
  currentStatus: string;
  headline: Record<RepairStatus, string>;
  /** Taken in, repairing, done, handed back. */
  steps: [string, string, string, string];
  call: string;
  location: string;
  customer: string;
  completedDate: string;
  bring: string;
  notFound: string;
}

export const TRACK_TEXT: Record<AppLanguage, TrackText> = {
  mm: {
    title: "Repair Tracking",
    intro: "ဖုန်းပြင်ဆင်မှုအခြေအနေကို လုံခြုံစွာ ကြည့်ရှုနိုင်ပါသည်။",
    currentStatus: "လက်ရှိအခြေအနေ",
    headline: {
      RECEIVED: "ဖုန်းကို လက်ခံပြီးပါပြီ",
      CHECKING: "ဖုန်းကို စစ်ဆေးနေပါသည်",
      IN_PROGRESS: "ဖုန်းကို ပြင်ဆင်နေပါသည်",
      WAITING_PARTS: "အပိုပစ္စည်း စောင့်နေပါသည်",
      DONE: "ပြင်ပြီးပါပြီ — လာရွေးနိုင်ပါပြီ",
      CANNOT_REPAIR: "ပြင်၍ မရပါ — ဖုန်းလာယူနိုင်ပါသည်",
      DELIVERED: "ဖုန်းကို ပြန်ပေးပြီးပါပြီ",
      CANCELLED: "ပယ်ဖျက်ထားပါသည်",
    },
    steps: ["လက်ခံပြီး", "ပြင်ဆင်နေ", "ပြင်ပြီး", "ပြန်ပေးပြီး"],
    call: "ဖုန်းခေါ်ရန်",
    location: "ဆိုင်တည်နေရာ",
    customer: "Customer",
    completedDate: "ပြီးသည့်ရက်",
    bring: "ဖုန်းလာရွေးသည့်အခါ လက်ခံ Voucher ကို ယူလာပါ။",
    notFound: "ဤ QR ဖြင့် ပြုပြင်မှုမှတ်တမ်း မတွေ့ပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။",
  },
  en: {
    title: "Repair Tracking",
    intro: "Check where your repair stands, securely.",
    currentStatus: "Current status",
    headline: {
      RECEIVED: "Your device has been taken in",
      CHECKING: "Your device is being checked",
      IN_PROGRESS: "Your device is being repaired",
      WAITING_PARTS: "Waiting for a part",
      DONE: "Repaired — ready to collect",
      CANNOT_REPAIR: "Cannot be repaired — please collect your device",
      DELIVERED: "Your device has been handed back",
      CANCELLED: "Cancelled",
    },
    steps: ["Taken in", "Repairing", "Done", "Handed back"],
    call: "Call",
    location: "Shop location",
    customer: "Customer",
    completedDate: "Completed",
    bring: "Bring your voucher when you collect the device.",
    notFound: "No repair was found for this QR. Please contact the shop.",
  },
  th: {
    title: "ติดตามงานซ่อม",
    intro: "ตรวจสอบสถานะการซ่อมได้อย่างปลอดภัย",
    currentStatus: "สถานะปัจจุบัน",
    headline: {
      RECEIVED: "รับเครื่องแล้ว",
      CHECKING: "กำลังตรวจเช็กเครื่อง",
      IN_PROGRESS: "กำลังซ่อมเครื่อง",
      WAITING_PARTS: "กำลังรออะไหล่",
      DONE: "ซ่อมเสร็จแล้ว — มารับเครื่องได้",
      CANNOT_REPAIR: "ซ่อมไม่ได้ — มารับเครื่องคืนได้",
      DELIVERED: "คืนเครื่องแล้ว",
      CANCELLED: "ยกเลิกแล้ว",
    },
    steps: ["รับเครื่อง", "กำลังซ่อม", "ซ่อมเสร็จ", "คืนเครื่อง"],
    call: "โทร",
    location: "ที่ตั้งร้าน",
    customer: "ลูกค้า",
    completedDate: "วันที่ซ่อมเสร็จ",
    bring: "กรุณานำใบรับซ่อมมาด้วยเมื่อมารับเครื่อง",
    notFound: "ไม่พบรายการซ่อมจาก QR นี้ กรุณาติดต่อร้าน",
  },
};

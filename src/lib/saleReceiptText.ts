/** The words on a sale receipt. Like the repair voucher it is the customer's, so it follows
 *  the shop's main currency, not the language the till is shown in: Thai for a THB shop,
 *  English otherwise (an MMK shop's receipt has always printed in English).
 */

import { currencyLanguage } from "@/lib/currency";

export interface ReceiptText {
  title: string;
  invoice: string;
  date: string;
  cashier: string;
  item: string;
  qty: string;
  price: string;
  /** The column of line totals. */
  amount: string;
  subtotal: string;
  discount: string;
  /** The grand total. */
  total: string;
  paid: string;
  change: string;
  owing: string;
  customer: string;
  walkIn: string;
  thanks: string;
  /** "(until 12 Nov 2027)" after a warranty. */
  until: string;
  note: string;
  foc: string;
}

const EN: ReceiptText = {
  title: "Sale Receipt",
  invoice: "Invoice",
  date: "Date",
  cashier: "Cashier",
  item: "Item",
  qty: "Qty",
  price: "Price",
  amount: "Total",
  subtotal: "Subtotal",
  discount: "Discount",
  total: "Total",
  paid: "Paid",
  change: "Change",
  owing: "Owing",
  customer: "Customer",
  walkIn: "Walk-in Customer",
  thanks: "Thank you.",
  until: "until",
  note: "Note",
  foc: "FOC",
};

const TH: ReceiptText = {
  title: "ใบเสร็จรับเงิน",
  invoice: "เลขที่",
  date: "วันที่",
  cashier: "พนักงานขาย",
  item: "รายการ",
  qty: "จำนวน",
  price: "ราคา",
  amount: "รวม",
  subtotal: "รวมย่อย",
  discount: "ส่วนลด",
  total: "ยอดรวม",
  paid: "ชำระแล้ว",
  change: "เงินทอน",
  owing: "ค้างชำระ",
  customer: "ลูกค้า",
  walkIn: "ลูกค้าทั่วไป",
  thanks: "ขอบคุณที่ใช้บริการ",
  until: "ถึง",
  note: "หมายเหตุ",
  foc: "ฟรี",
};

/** True when the receipt is written in the shop's own language and must be left as it is,
 *  rather than following the screen's language like the rest of the page. */
export function receiptHasOwnLanguage(currency: string | null | undefined): boolean {
  return currencyLanguage(currency) !== "mm";
}

export function receiptText(currency: string | null | undefined): ReceiptText {
  return currencyLanguage(currency) === "th" ? TH : EN;
}

/** Payment methods a shop accepts for Telegram bet orders.
 *
 *  Stored as the "payments" settings document so a shop can change its KPay number
 *  without a deploy. The customer is shown these and sends back a slip photo.
 */

export const PAYMENT_TYPES = ["KPAY", "WAVE", "AYAPAY", "CBPAY", "BANK", "CASH"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** Shown to customers, who only ever see Myanmar. */
export const PAYMENT_TYPE_LABEL_MY: Record<PaymentType, string> = {
  KPAY: "KBZPay",
  WAVE: "Wave Money",
  AYAPAY: "AYA Pay",
  CBPAY: "CB Pay",
  BANK: "ဘဏ်လွှဲ",
  CASH: "ငွေသား",
};

export interface PaymentMethod {
  id: string;
  type: PaymentType;
  accountName: string;
  accountNumber: string;
  note?: string;
  active: boolean;
}

export function isPaymentType(value: unknown): value is PaymentType {
  return PAYMENT_TYPES.includes(value as PaymentType);
}

/** Reads the stored document defensively — it is hand-edited JSON in the settings table,
 *  and a malformed entry must not take the whole bot down. */
export function parsePaymentMethods(value: unknown): PaymentMethod[] {
  const raw = value && typeof value === "object" ? (value as { methods?: unknown }).methods : null;
  if (!Array.isArray(raw)) return [];

  const out: PaymentMethod[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (!isPaymentType(row.type)) continue;
    const accountNumber = String(row.accountNumber ?? "").trim();
    const accountName = String(row.accountName ?? "").trim();
    // Cash needs no account; everything else is useless to a customer without a number.
    if (row.type !== "CASH" && !accountNumber) continue;
    out.push({
      id: String(row.id ?? `${row.type}-${accountNumber}`),
      type: row.type,
      accountName,
      accountNumber,
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : undefined,
      active: row.active !== false,
    });
  }
  return out;
}

export function activePaymentMethods(value: unknown): PaymentMethod[] {
  return parsePaymentMethods(value).filter((method) => method.active);
}

/** The payment instructions a customer sees, in Myanmar. */
export function paymentInstructionsMy(methods: PaymentMethod[]): string {
  return methods
    .map((method) => {
      const lines = [`💳 ${PAYMENT_TYPE_LABEL_MY[method.type]}`];
      if (method.accountNumber) lines.push(`   နံပါတ် — ${method.accountNumber}`);
      if (method.accountName) lines.push(`   အမည် — ${method.accountName}`);
      if (method.note) lines.push(`   ${method.note}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

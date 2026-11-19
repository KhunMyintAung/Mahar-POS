// How a shop pays for Pro, from the server's settings (never hardcoded in the page). The KBZ Pay
// account and the PromptPay code are the operator's own — the same ones the About page shows.

import { DEFAULT_ABOUT } from "@/lib/about";

/** Kyat per one Thai baht, set by the operator (PRO_MMK_PER_THB). Null when not set, which turns
 *  the PromptPay option off rather than charging a wrong amount. */
export function mmkPerThb(): number | null {
  const n = Number(process.env.PRO_MMK_PER_THB);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The pay details the upgrade screen shows. */
export function proPayInfo() {
  return {
    method: process.env.PRO_PAY_METHOD?.trim() || "KBZ Pay",
    name: process.env.PRO_PAY_NAME?.trim() || "",
    phone: process.env.PRO_PAY_PHONE?.trim() || "",
    // An optional extra line shown under the account.
    note: process.env.PRO_PAYMENT_TEXT?.trim() || "",
    // The QR codes already on the About page, so a payer can scan instead of typing.
    kbzPayload: DEFAULT_ABOUT.kbzPayload,
    promptPay: { name: DEFAULT_ABOUT.promptPayName, payload: DEFAULT_ABOUT.promptPayPayload },
    mmkPerThb: mmkPerThb(),
  };
}

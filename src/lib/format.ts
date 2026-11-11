// Client-safe formatting helpers. API money values arrive as strings of minor
// units (1/100). No floating point is used for display math.

function money(minor: string | number | bigint | null | undefined, currency: string | undefined, cents: (digits: string) => string): string {
  if (minor === null || minor === undefined) return "-";
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % 100n;
  const s = frac === 0n ? whole : `${whole}.${cents(frac.toString().padStart(2, "0"))}`;
  return `${neg ? "-" : ""}${s}${currency ? " " + currency : ""}`;
}

const RAISED = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** For the screen: the digits after the point are small and raised, 1,234.⁵⁰ */
export function fmtMoney(minor: string | number | bigint | null | undefined, currency?: string): string {
  return money(minor, currency, (digits) => digits.replace(/\d/g, (d) => RAISED[Number(d)]));
}

/** For text that leaves the app, such as a Telegram message: ordinary digits, 1,234.50 */
export function fmtMoneyPlain(minor: string | number | bigint | null | undefined, currency?: string): string {
  return money(minor, currency, (digits) => digits);
}

/** The time zone dates and times are shown in. The signed-in shop's own (AppShell sets it
 *  from Business.timezone); Asia/Yangon until then, and on the server. */
let shopTimeZone = "Asia/Yangon";

/** True for a zone name the runtime knows ("Asia/Bangkok"), so a bad stored value is never used. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function setShopTimeZone(zone: string | null | undefined) {
  shopTimeZone = isTimeZone(zone) ? zone : "Asia/Yangon";
}

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-GB", {
    timeZone: shopTimeZone,
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-GB", { timeZone: shopTimeZone, day: "2-digit", month: "short", year: "numeric" });
}

export const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  CLOSED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  RESULT_ENTERED: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  SETTLED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PARTIAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  UNPAID: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  REVERSED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  REOPENED: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  WRITTEN_OFF: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

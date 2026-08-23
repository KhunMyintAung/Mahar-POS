// Client-safe formatting helpers. API money values arrive as strings of minor
// units (1/100). No floating point is used for display math.

export function fmtMoney(minor: string | number | bigint | null | undefined, currency?: string): string {
  if (minor === null || minor === undefined) return "-";
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % 100n;
  const s = frac === 0n ? whole : `${whole}.${frac.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${s}${currency ? " " + currency : ""}`;
}

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Yangon", day: "2-digit", month: "short", year: "numeric" });
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

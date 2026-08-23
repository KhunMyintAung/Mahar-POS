// Business dates are YYYY-MM-DD strings in the business timezone (Asia/Yangon).

const TZ = process.env.DEFAULT_TIMEZONE || "Asia/Yangon";

export function todayBusinessDate(): string {
  return businessDateOf(new Date());
}

export function businessDateOf(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA gives YYYY-MM-DD
}

export function isValidBusinessDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** UTC range covering one business date in the business timezone (approx: Yangon = UTC+6:30). */
export function dateRangeUtc(date: string): { gte: Date; lt: Date } {
  const offsetMin = 390; // Asia/Yangon +06:30, fixed (no DST)
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - offsetMin * 60_000);
  return { gte: start, lt: new Date(start.getTime() + 24 * 3600 * 1000) };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Business dates are YYYY-MM-DD strings in the shop's own time zone (Business.timezone):
// Asia/Yangon for the shops in Myanmar, Asia/Bangkok for one in Thailand. A shop's day, its
// reports and its "today" all turn over at its own midnight.
//
// Which shop is being served is known three ways: on the server from the request (shopZone.ts
// sets a resolver), in the browser from the signed-in shop (setShopZone, from AppShell), and
// in a "This device only" shop the same way. Where none is known the default applies.

const DEFAULT_ZONE = process.env.DEFAULT_TIMEZONE || "Asia/Yangon";

/** The zone of the one shop this browser (or device engine) is showing. Never set on the server. */
let ownZone: string | undefined;
/** On the server: the zone of the shop the current request is for. */
let resolver: () => string | undefined = () => undefined;

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

export function setShopZone(zone: string | null | undefined) {
  ownZone = isTimeZone(zone) ? zone : undefined;
}

export function setZoneResolver(fn: () => string | undefined) {
  resolver = fn;
}

/** The time zone of the shop being served. */
export function shopZone(): string {
  return resolver() ?? ownZone ?? DEFAULT_ZONE;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
const partFormats = new Map<string, Intl.DateTimeFormat>();

function dayFormat(zone: string) {
  let f = dayFormats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(zone, f);
  }
  return f;
}

/** How far a zone is ahead of UTC at a moment, in minutes (+390 for Yangon, +420 for Bangkok). */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  let f = partFormats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partFormats.set(zone, f);
  }
  const parts = f.formatToParts(at);
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export function todayBusinessDate(): string {
  return businessDateOf(new Date());
}

export function businessDateOf(d: Date): string {
  return dayFormat(shopZone()).format(d); // en-CA gives YYYY-MM-DD
}

/** The time now on the shop's clock, as "HH:MM". */
export function shopClock(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: shopZone(), hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export function isValidBusinessDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** The moment a business date begins in the shop's zone. */
function startOfBusinessDate(date: string): Date {
  const zone = shopZone();
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  // The offset at about that time, then once more at the answer: the two differ only in a
  // zone whose clocks change, on the day they change.
  const first = midnightUtc - zoneOffsetMinutes(zone, new Date(midnightUtc)) * 60_000;
  return new Date(midnightUtc - zoneOffsetMinutes(zone, new Date(first)) * 60_000);
}

/** UTC range covering one business date in the shop's time zone. */
export function dateRangeUtc(date: string): { gte: Date; lt: Date } {
  return { gte: startOfBusinessDate(date), lt: startOfBusinessDate(addDays(date, 1)) };
}

/** UTC range covering one calendar month ("YYYY-MM") in the shop's time zone. */
export function monthRangeUtc(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { gte: dateRangeUtc(`${month}-01`).gte, lt: dateRangeUtc(`${next}-01`).gte };
}

export function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

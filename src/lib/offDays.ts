/** Off days: days the shop was shut. A day with nothing recorded is not taken to be an off
 *  day by itself (it may be a day nobody entered the books): the owner marks it off, or sets
 *  the shop's weekly off day. A day marked off that has records after all was worked, and
 *  counts as open. Stored per shop under OFF_DAYS_KEY. */

export const OFF_DAYS_KEY = "off_days";

export interface OffDays {
  /** Weekdays the shop is shut every week: 0 Sunday … 6 Saturday. */
  weekly: number[];
  /** Single dates marked off (YYYY-MM-DD). */
  days: string[];
}

export const NO_OFF_DAYS: OffDays = { weekly: [], days: [] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseOffDays(raw: unknown): OffDays {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<OffDays>;
  const weekly = Array.isArray(v.weekly) ? [...new Set(v.weekly.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const days = Array.isArray(v.days) ? [...new Set(v.days.filter((d): d is string => typeof d === "string" && DATE.test(d)))].sort() : [];
  return { weekly, days };
}

/** Marks a date off, or takes the mark away. */
export function markOffDay(cfg: OffDays, date: string, off: boolean): OffDays {
  const days = new Set(cfg.days);
  if (off) days.add(date); else days.delete(date);
  return { ...cfg, days: [...days].sort() };
}

export type DayKind = "open" | "off" | "none";

/** How a day counts: open (something recorded), off (shut: marked, or the weekly off day,
 *  with nothing recorded), or none (nothing recorded and not marked off). */
export function dayKind(date: string, active: Set<string>, cfg: OffDays): DayKind {
  if (active.has(date)) return "open";
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (cfg.days.includes(date) || cfg.weekly.includes(weekday)) return "off";
  return "none";
}

export interface DayCounts { open: number; off: number; none: number; noneDates: string[]; offDates: string[] }

/** Counts the days from one date to another (both included), up to `today`: days to come
 *  are not counted yet. */
export function countDays(from: string, to: string, today: string, active: Set<string>, cfg: OffDays): DayCounts {
  const out: DayCounts = { open: 0, off: 0, none: 0, noneDates: [], offDates: [] };
  const end = to < today ? to : today;
  const d = new Date(`${from}T00:00:00Z`);
  for (let day = from; day <= end; d.setUTCDate(d.getUTCDate() + 1), day = d.toISOString().slice(0, 10)) {
    const k = dayKind(day, active, cfg);
    out[k] += 1;
    if (k === "none") out.noneDates.push(day);
    if (k === "off") out.offDates.push(day);
  }
  return out;
}

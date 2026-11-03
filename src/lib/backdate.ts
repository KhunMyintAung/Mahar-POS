/** Recording money for a day other than today (yesterday's bill sales, added up, or an
 *  expense forgotten last week) changes figures already looked at, so only the owner or an
 *  admin may do it, and the screen asks first. A day still to come is refused for everyone. */
export function canRecordOtherDay(roleName?: string | null) {
  return roleName === "Owner" || roleName === "Admin";
}

/** Why this date cannot be used by this role, or null when it can. */
export function otherDayProblem(roleName: string | null | undefined, date: string, today: string): string | null {
  if (date > today) return "A day still to come cannot be used";
  if (date < today && !canRecordOtherDay(roleName)) return "Only the owner or an admin can record for another day";
  return null;
}

/** Noon on a business day (Asia/Yangon), the time given to a record entered for that day,
 *  so it falls on that day in every report. */
export function businessNoon(date: string): Date {
  return new Date(Date.parse(`${date}T12:00:00+06:30`));
}

/** The time zone of the device, left in a cookie by the Google button so that a shop created
 *  by signing in with Google (a redirect, with no form to carry it) keeps its own zone. */

export const ZONE_COOKIE = "mahar-zone";

/** For the browser: the cookie to set, good for ten minutes. */
export function zoneCookie(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  return `${ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=600; samesite=lax`;
}

/** For the server: the zone read back from the cookie's value. */
export function deviceZone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

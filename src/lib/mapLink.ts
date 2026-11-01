/** A customer's location as a link that opens in Google Maps: a link stays as it is,
 *  "lat,lng" (what the phone's location gives) becomes a maps search for that point, and
 *  anything else is searched as a place name. */
export function mapLink(location?: string | null): string | null {
  const v = location?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
}

/** "lat,lng" to 6 places, about 10 cm, which is all a phone's position is worth. */
export const pointText = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

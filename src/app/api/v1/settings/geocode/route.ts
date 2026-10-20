import { withAuth, json, ApiError } from "@/lib/api";

/** Turns the shop's coordinates into a city and street address, for the settings page's
 *  "use my location" button. It runs here rather than in the browser so the page's
 *  content security policy stays limited to this site.
 *
 *  OpenStreetMap's Nominatim asks for an identifying User-Agent and light use, which one
 *  lookup per button press is.
 */

interface NominatimAddress {
  road?: string; house_number?: string; suburb?: string; quarter?: string; township?: string;
  city?: string; town?: string; village?: string; municipality?: string; county?: string; state?: string;
}

export const GET = withAuth("settings.manage", async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ApiError(422, "Invalid location");
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`;
  let address: NominatimAddress = {};
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MaharMiniPOS/1.0 (shop settings)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) address = ((await res.json()) as { address?: NominatimAddress }).address ?? {};
  } catch {
    // The coordinates are still worth saving when the lookup is down; the city is then typed in.
  }

  const city = address.city ?? address.town ?? address.municipality ?? address.village ?? address.county ?? address.state ?? "";
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const area = address.suburb ?? address.quarter ?? address.township ?? "";
  return json({ city, address: [street, area, city].filter(Boolean).join(", ") });
});

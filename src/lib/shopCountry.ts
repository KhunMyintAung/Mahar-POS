/** The country a shop is in, worked out from what every shop already has: the time zone of
 *  the device it signed up on and its main currency. It is what the public shop list and the
 *  admin's list show for a shop that has not typed its city yet.
 *
 *  Shops opened before the time zone was recorded all carry the default (Asia/Yangon), so for
 *  those the currency decides: a baht shop is in Thailand.
 */
const ZONE_COUNTRY: Record<string, string> = {
  "Asia/Yangon": "Myanmar", "Asia/Rangoon": "Myanmar",
  "Asia/Bangkok": "Thailand",
  "Asia/Singapore": "Singapore", "Asia/Kuala_Lumpur": "Malaysia",
  "Asia/Ho_Chi_Minh": "Vietnam", "Asia/Saigon": "Vietnam", "Asia/Phnom_Penh": "Cambodia", "Asia/Vientiane": "Laos",
  "Asia/Kolkata": "India", "Asia/Calcutta": "India", "Asia/Dhaka": "Bangladesh",
  "Asia/Tokyo": "Japan", "Asia/Seoul": "South Korea", "Asia/Dubai": "United Arab Emirates",
};

export function shopCountry(timezone: string | null | undefined, currency: string | null | undefined): string {
  const zone = timezone ?? "";
  const isDefaultZone = zone === "" || zone === "Asia/Yangon" || zone === "Asia/Rangoon";
  if (isDefaultZone) {
    if (currency === "THB") return "Thailand";
    // A dollar shop on the default zone could be anywhere: say nothing rather than guess.
    return currency === "USD" ? "" : "Myanmar";
  }
  return ZONE_COUNTRY[zone] ?? "";
}

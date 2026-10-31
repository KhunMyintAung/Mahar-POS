/** The visitor's address as nginx saw it, for rate limits.
 *
 *  maharpos.shop is served straight from nginx, without Cloudflare in front (Myanmar
 *  networks block the Cloudflare IPs), so a CF-Connecting-IP header is whatever the
 *  visitor chose to send. nginx sets X-Real-IP to the socket address, replacing any sent
 *  value, and appends that address as the last X-Forwarded-For entry; the first entry is
 *  the visitor's own claim. */
export function clientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "unknown";
}

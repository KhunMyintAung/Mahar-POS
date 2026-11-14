/** Ownership marks for Mahar POS's own code.
 *
 *  This app is built and run by maharpos.shop. A build served from anywhere else is an
 *  unauthorized copy, and these marks make such a copy traceable:
 *   - ORIGIN_CANARY is a unique, plain-text signature placed in the page's HTML on every
 *     screen. Searching the web for it turns up copies that kept the markup.
 *   - isAuthorizedHost() tells our own domains apart from a copy's, for the on-page notice
 *     and the copy-report beacon (see OriginGuard).
 *
 *  None of this is a secret and none of it is a licence check that a shop needs to pass; it
 *  only marks whose work the code is. A determined copier with the full client bundle can
 *  still strip it — nothing on the client is tamper-proof — but it raises the cost of taking
 *  the code and leaves evidence of where it came from.
 */

/** A unique, searchable signature. Search the web (or a suspected copy's page source) for
 *  this exact string to find builds that kept the markup. Do not change it once shipped, or
 *  older copies stop matching. */
export const ORIGIN_CANARY = "MAHARPOS-ORIGIN::maharpos.shop::a1b9f4c2-e7d8-4a6f-9c31-0f2d6e8b5a74";

/** The home of this app. */
export const ORIGIN_SITE = "maharpos.shop";

/** Shown on a copy, and left in the markup, so a copied build names its real author. */
export const ORIGIN_NOTICE = "Mahar POS — © maharpos.shop. This build is licensed to its shop and may not be copied.";

/** Hosts this app is meant to run on: our own brands and development. Set from the real
 *  domains before this ships — a host left out here would show the copy notice on our own
 *  site. localhost / 127.0.0.1 / *.local keep development quiet. */
export const AUTHORIZED_HOSTS: string[] = [
  "maharpos.shop",
  "app.maharpos.shop",
  "maharshwe.shop",
  "app.maharshwe.shop",
  "walletnote.online",
  "app.walletnote.online",
];

/** True when `host` is one of ours (exact, or a sub-domain of one), or a local development
 *  host. A blank host (a file:// or odd context) counts as ours, so we never flag it. */
export function isAuthorizedHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const h = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local") || h.endsWith(".localhost")) return true;
  return AUTHORIZED_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

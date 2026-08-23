import type { MetadataRoute } from "next";
import { SITE_URL } from "./layout";

/** Only the pages that describe the product are open to crawlers.
 *
 *  Everything behind sign-in is a shop's own books. Those pages redirect to the login
 *  screen anyway, but saying so here keeps them out of the index rather than relying on a
 *  crawler to give up — and a search result pointing at another shop's dashboard, even a
 *  redirecting one, is not something to leave to chance.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/features", "/privacy", "/login", "/register"],
      disallow: ["/api/", "/admin", "/account-deletion"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

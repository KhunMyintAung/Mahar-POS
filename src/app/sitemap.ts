import type { MetadataRoute } from "next";
import { SITE_URL } from "./layout";

/** The four pages worth indexing. /features is the one that should rank, so it carries the
 *  higher priority — the root only redirects a signed-out visitor to the login screen. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/features`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}

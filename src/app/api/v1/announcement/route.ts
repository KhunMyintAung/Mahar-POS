import { withAuth, json } from "@/lib/api";
import { loadAnnouncement } from "@/lib/announcement";

/** The platform announcement for the banner, when one is switched on. */
export const GET = withAuth(null, async () => {
  const a = await loadAnnouncement();
  return json(a?.enabled && a.text ? a : null);
});

import { withAuth, json, ApiError } from "@/lib/api";
import { todayBusinessDate } from "@/lib/dates";
import { earnings } from "@/services/staffService";

/** What each member of staff earned, by month for ?year=YYYY and in all. */
export const GET = withAuth("staff.manage", async ({ req, user }) => {
  const year = req.nextUrl.searchParams.get("year") || todayBusinessDate().slice(0, 4);
  if (!/^\d{4}$/.test(year)) throw new ApiError(422, "Invalid year");
  return json(await earnings(user.businessId, year));
});

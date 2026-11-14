import { withAuth, json, ApiError } from "@/lib/api";
import { sendPush, vapidPublicKey } from "@/lib/pushSend";

/** A pop-up on the signed-in person's own devices, from the settings card, to see it works. */
export const POST = withAuth(null, async ({ user }) => {
  if (!vapidPublicKey()) throw new ApiError(503, "Notifications are not set up on this server");
  const r = await sendPush(user.businessId, {
    title: "Mahar POS · စမ်းသပ်ချက်",
    body: "ဒီစက်မှာ အသိပေးချက်များ ရပါပြီ။\nNotifications work on this device.",
    url: "/settings",
  }, { onlyUserId: user.id });
  return json(r);
});

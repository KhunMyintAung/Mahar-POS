import { withAuth, json, ApiError } from "@/lib/api";
import { findShopByWalletId } from "@/services/mspWalletService";

// The shop name behind an MSP wallet ID, so the sender sees who they are sending to.
export const GET = withAuth("settings.manage", async ({ req }) => {
  const shop = await findShopByWalletId(req.nextUrl.searchParams.get("id") ?? "");
  if (!shop) throw new ApiError(404, "No shop has that MSP wallet ID");
  return json({ name: shop.name });
});

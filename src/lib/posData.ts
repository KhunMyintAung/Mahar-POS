import { WARRANTY_SETTING } from "@/lib/warranty";

/** The reads the till makes to ring up a sale. One list for the POS and for getting a device
 *  ready offline, so what is kept is exactly what the till asks for. */
export function posDataUrls(branchId: string | null | undefined) {
  return {
    me: "/api/v1/auth/me",
    items: "/api/v1/items?pageSize=1000&active=1",
    serials: `/api/v1/serials?status=IN_STOCK${branchId ? `&branchId=${branchId}` : ""}`,
    wallets: "/api/v1/wallets",
    customers: "/api/v1/customers?type=CUSTOMER&pageSize=200",
    warranty: `/api/v1/settings?key=${WARRANTY_SETTING}`,
  };
}

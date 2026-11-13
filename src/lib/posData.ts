import { WARRANTY_SETTING } from "@/lib/warranty";
import { REPAIR_FLOW_KEY } from "@/lib/repairFlow";

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

/** Beyond the till: what the Repairs and Items screens read, kept for use without the
 *  internet (exactly as those screens ask for it). */
export const OFFLINE_EXTRA_URLS = [
  "/api/v1/repairs?pageSize=1000",
  "/api/v1/repairs/technicians",
  "/api/v1/repairs/device-suggestions",
  "/api/v1/settings/repair-voucher",
  `/api/v1/settings?key=${REPAIR_FLOW_KEY}`,
  "/api/v1/items?pageSize=1000",
  "/api/v1/item-meta",
  "/api/v1/stock",
];

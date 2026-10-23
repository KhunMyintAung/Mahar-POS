import { prisma } from "./prisma";

/** The shop's Online Shop: a public page at /shop/<slug> listing the items the shop has
 *  marked "Show online", with their photos, price and stock, where a customer can send an
 *  order. The order lands in the app (Online Shop → Orders) and on Telegram; the shop rings
 *  it up in POS like any other sale.
 *
 *  The address (Business.shopSlug) is its own column so a visitor's link finds the shop
 *  with one lookup; the rest of the page's words are a SystemSetting. */
export const ONLINE_SHOP_KEY = "online_shop";

/** Lower-case letters, digits and dashes, 3–40 long, not starting or ending with a dash. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
/** Addresses a shop cannot take: they read as the app's own. */
const RESERVED = new Set(["admin", "api", "app", "login", "shop", "shops", "mahar", "maharpos", "support", "help", "new"]);

export function slugProblem(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) return "Use 3–40 small letters, numbers or dashes, e.g. mahar-shwe-mobile";
  if (RESERVED.has(slug)) return "That address is taken. Try another.";
  return null;
}

/** A first suggestion from the shop's name: "Mahar Shwe Mobile" → "mahar-shwe-mobile". */
export function suggestSlug(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s.length >= 3 ? s : "";
}

export interface OnlineShopSettings {
  /** Visitors see the shop only while this is on. */
  enabled: boolean;
  /** A line or two under the shop's name. */
  intro: string;
  /** How the order reaches the customer (delivery, pick up at the shop, fees…). */
  delivery: string;
  /** How to pay (cash on delivery, KBZPay 09…, …). */
  payment: string;
  /** The number the shop page offers to call or message; the shop's own when empty. */
  phone: string;
}

const DEFAULTS: OnlineShopSettings = {
  enabled: false,
  intro: "",
  delivery: "ပစ္စည်းကို ဆိုင်တွင် လာယူနိုင်သည် / အိမ်အရောက် ပို့ပေးသည်",
  payment: "ပစ္စည်းရောက်မှ ငွေချေ (Cash on delivery) / KBZPay",
  phone: "",
};

export function parseOnlineShop(raw: unknown): OnlineShopSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<OnlineShopSettings>;
  const text = (x: unknown, fallback: string, max: number) => (typeof x === "string" ? x.slice(0, max) : fallback);
  return {
    enabled: Boolean(v.enabled),
    intro: text(v.intro, DEFAULTS.intro, 300),
    delivery: text(v.delivery, DEFAULTS.delivery, 300),
    payment: text(v.payment, DEFAULTS.payment, 300),
    phone: text(v.phone, DEFAULTS.phone, 40),
  };
}

export async function loadOnlineShop(businessId: string): Promise<OnlineShopSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: ONLINE_SHOP_KEY } } });
  try { return parseOnlineShop(row ? JSON.parse(row.value) : undefined); } catch { return parseOnlineShop(undefined); }
}

export async function saveOnlineShop(businessId: string, cfg: OnlineShopSettings) {
  const value = JSON.stringify(cfg);
  await prisma.systemSetting.upsert({
    where: { businessId_key: { businessId, key: ONLINE_SHOP_KEY } },
    create: { businessId, key: ONLINE_SHOP_KEY, value },
    update: { value },
  });
}

/** Photos: up to this many per item, each at most this big once resized in the browser. */
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 400 * 1024;
export const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/;

/** Order statuses, in the order an order moves through them. */
export const ORDER_STATUSES = ["NEW", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Stock on hand of each item, over all branches. */
export async function stockByItem(itemIds: string[]): Promise<Map<string, number>> {
  const levels = await prisma.stockLevel.groupBy({ by: ["itemId"], where: { itemId: { in: itemIds } }, _sum: { quantity: true } });
  return new Map(levels.map((l) => [l.itemId, l._sum.quantity ?? 0]));
}

/** What a visitor sees: the shop, and its items shown online (active, not deleted). */
export async function publicShop(slug: string) {
  const business = await prisma.business.findUnique({
    where: { shopSlug: slug },
    select: { id: true, name: true, phone: true, address: true, logoUrl: true, currency: true },
  });
  if (!business) return null;
  const cfg = await loadOnlineShop(business.id);
  if (!cfg.enabled) return null;
  const items = await prisma.item.findMany({
    where: { businessId: business.id, onlineVisible: true, active: true, deletedAt: null },
    select: {
      id: true, name: true, description: true, sellingPrice: true,
      category: { select: { name: true } },
      images: { select: { id: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { name: "asc" },
  });
  const stock = await stockByItem(items.map((i) => i.id));
  return {
    business,
    cfg,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? "",
      category: i.category?.name ?? "",
      price: i.sellingPrice,
      stock: Math.max(0, stock.get(i.id) ?? 0),
      images: i.images.map((im) => im.id),
    })),
  };
}

/** A simple brake on the public order form: a few orders per address per ten minutes. */
const recent = new Map<string, number[]>();
export function allowOrder(key: string, max = 5, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { recent.set(key, list); return false; }
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => now - t < windowMs)) recent.delete(k);
  return true;
}

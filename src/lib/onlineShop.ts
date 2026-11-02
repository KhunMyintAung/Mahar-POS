import { NextResponse } from "next/server";
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
  /** A Google Maps link to the shop. Empty: the location saved in Settings, else the address. */
  mapUrl: string;
  /** The shop's pages elsewhere, each a link or a name (@page, a Viber number…). */
  links: ShopLinks;
  /** Where the shop page's Game Top-up button goes (the game top-up page for this shop). */
  gameTopupUrl: string;
}

export const SHOP_LINK_KINDS = ["facebook", "messenger", "telegram", "viber", "tiktok"] as const;
export type ShopLinkKind = (typeof SHOP_LINK_KINDS)[number];
export type ShopLinks = Record<ShopLinkKind, string>;
const NO_LINKS: ShopLinks = { facebook: "", messenger: "", telegram: "", viber: "", tiktok: "" };

/** A web link as typed, or "" when it is not one (no javascript:, no bare words). */
export function webUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v) ? `https://${v}` : "";
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Where one of the shop's links opens: a full link as is, or a name made into the site's link
 *  (@shop → t.me/shop, 09… → Viber chat). "" when it cannot be made into a link. */
export function shopLinkHref(kind: ShopLinkKind, raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (kind === "viber") {
    if (/^viber:\/\//i.test(v)) return v.replace(/[^\w:/?=&%+.-]/g, "");
    const digits = v.replace(/[^\d+]/g, "");
    if (/^\+?\d{6,15}$/.test(digits) && !/[a-z]/i.test(v)) {
      const intl = digits.startsWith("+") ? digits : digits.startsWith("0") ? `+95${digits.slice(1)}` : `+${digits}`;
      return `viber://chat?number=${encodeURIComponent(intl)}`;
    }
    return webUrl(v);
  }
  const url = webUrl(v);
  if (url) return url;
  const name = v.replace(/^@/, "");
  if (!/^[\w.-]{2,100}$/.test(name)) return "";
  const base = { facebook: "https://www.facebook.com/", messenger: "https://m.me/", telegram: "https://t.me/", tiktok: "https://www.tiktok.com/@" }[kind];
  return base + name;
}

/** The map button's link: the shop's own Maps link, else its saved location, else its address. */
export function shopMapHref(mapUrl: string, latitude: number | null | undefined, longitude: number | null | undefined, address: string | null | undefined): string {
  const own = webUrl(mapUrl);
  if (own) return own;
  if (typeof latitude === "number" && typeof longitude === "number") return `https://www.google.com/maps?q=${latitude},${longitude}`;
  if (address?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  return "";
}

const DEFAULTS: OnlineShopSettings = {
  enabled: false,
  intro: "",
  delivery: "ပစ္စည်းကို ဆိုင်တွင် လာယူနိုင်သည် / အိမ်အရောက် ပို့ပေးသည်",
  payment: "ပစ္စည်းရောက်မှ ငွေချေ (Cash on delivery) / KBZPay",
  phone: "",
  mapUrl: "",
  links: NO_LINKS,
  gameTopupUrl: "",
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
    mapUrl: webUrl(text(v.mapUrl, "", 500)),
    links: Object.fromEntries(SHOP_LINK_KINDS.map((k) => [k, text((v.links as Partial<ShopLinks> | undefined)?.[k], "", 200).trim()])) as ShopLinks,
    gameTopupUrl: webUrl(text(v.gameTopupUrl, "", 500)),
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

/** The shop page's cover photo, a data URL like the logo, kept apart from the settings so they
 *  stay small. */
export const ONLINE_SHOP_COVER_KEY = "online_shop_cover";

export async function loadShopCover(businessId: string): Promise<{ dataUrl: string; version: number } | null> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: ONLINE_SHOP_COVER_KEY } } });
  let dataUrl: unknown;
  try { dataUrl = row ? JSON.parse(row.value) : null; } catch { return null; }
  return row && typeof dataUrl === "string" && IMAGE_DATA_URL.test(dataUrl) ? { dataUrl, version: row.updatedAt.getTime() } : null;
}

/** Settings values are JSON, so the photo is kept as a JSON string. */
export async function saveShopCover(businessId: string, dataUrl: string) {
  const value = JSON.stringify(dataUrl);
  return prisma.systemSetting.upsert({
    where: { businessId_key: { businessId, key: ONLINE_SHOP_COVER_KEY } },
    create: { businessId, key: ONLINE_SHOP_COVER_KEY, value },
    update: { value },
  });
}

/** The cover photo as the picture itself. Only the types an upload may be (never SVG). */
export function coverImageResponse(dataUrl: string, cacheControl: string): NextResponse {
  const m = dataUrl.match(IMAGE_DATA_URL);
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
    headers: { "Content-Type": m[1], "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
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
    select: { id: true, name: true, phone: true, address: true, logoUrl: true, currency: true, latitude: true, longitude: true },
  });
  if (!business) return null;
  const cfg = await loadOnlineShop(business.id);
  if (!cfg.enabled) return null;
  const items = await prisma.item.findMany({
    where: { businessId: business.id, onlineVisible: true, active: true, deletedAt: null },
    select: {
      id: true, name: true, description: true, sellingPrice: true, model: true, variant: true,
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
      model: i.model ?? "",
      variant: i.variant ?? "",
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

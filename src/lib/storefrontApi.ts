import { shopLinkHref, shopMapHref } from "./onlineShop";
import type { PublicShop } from "./onlineOrder";
import { groupByModel, variantLabel } from "./variants";

/** maharpos.shop/shop/<address> is the storefront page from the first Mahar POS
 *  (storefront.html on the landing site), which reads its shop through
 *  /api/public/store/<address>. These turn this app's Online Shop into what that page reads,
 *  so it keeps its look while showing this app's items, prices and stock.
 *
 *  Its money is whole kyat, as text; this app's is ×100. */

type ShopItem = PublicShop["items"][number];

const kyat = (minor: bigint) => (minor / 100n).toString();
const PAGE_SIZE = 10;

export function storefrontStore(shop: PublicShop, slug: string, coverVersion: number | null) {
  const { business, cfg } = shop;
  return {
    slug,
    name: business.name,
    logoUrl: business.logoUrl ? `/api/public/shop-logo/${business.id}` : null,
    description: cfg.intro,
    phone: cfg.phone || business.phone || "",
    telegramUrl: shopLinkHref("telegram", cfg.links.telegram) || null,
    // The page falls back to the Mahar Shwe VPN bot.
    vpnBotUrl: null,
    // Customer accounts belong to the first Mahar POS; here customers order without one.
    googleClientId: null,
    mapUrl: shopMapHref(cfg.mapUrl, business.latitude, business.longitude, business.address) || null,
    bannerUrl: coverVersion ? `/api/public/shop/${encodeURIComponent(slug)}/cover?v=${coverVersion}` : null,
    address: business.address ?? "",
    verified: false,
    verificationType: null,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryFee: 0,
  };
}

const categoryOf = (name: string) => ({ id: name, name, kind: name.toUpperCase(), active: true });

export interface StorefrontQuery { page: number; search: string; categoryId: string; stockLevel: string }

/** One product per model, its items as the variants to choose from; ten to a page. */
export function storefrontProducts(items: ShopItem[], q: StorefrontQuery) {
  const needle = q.search.trim().toLowerCase();
  const shown = items.filter((i) =>
    (!q.categoryId || i.category === q.categoryId) &&
    (q.stockLevel !== "IN_STOCK" || i.stock > 0) &&
    (!needle || [i.name, i.model, i.category].some((s) => s?.toLowerCase().includes(needle))));
  const groups = groupByModel(shown);
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, q.page), totalPages);
  const products = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((g) => {
    const first = g.items[0];
    const category = first.category ? categoryOf(first.category) : null;
    return {
      id: first.id,
      name: g.model,
      brand: null,
      model: g.model,
      groupName: null,
      categoryId: category?.id ?? null,
      category,
      productType: category?.kind ?? "",
      active: true,
      ecommerceDetail: { visible: true, description: first.description, featured: false },
      ecommerceImages: g.items.flatMap((i) => i.images).map((id) => ({ id, url: `/api/public/item-image/${id}` })),
      variants: g.items.map((i) => ({
        id: i.id,
        variantName: g.items.length > 1 ? variantLabel(i) : "Default",
        unit: "pcs",
        ram: null,
        storage: null,
        color: null,
        standardSellingPrice: kyat(i.price),
        inventoryBalance: { quantity: i.stock },
      })),
    };
  });
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))].sort().map(categoryOf);
  return { ok: true, page, pageSize: PAGE_SIZE, total: groups.length, totalPages, brands: [], categories, products };
}

/** A saved order as the page shows it on its success screen and in its order list. */
export function storefrontOrder(order: { orderNo: string; createdAt: Date; total: bigint; lines: { itemId: string; name: string; quantity: number; unitPrice: bigint }[] }) {
  return {
    id: order.orderNo,
    orderNumber: order.orderNo,
    status: "PENDING",
    total: kyat(order.total),
    createdAt: order.createdAt.toISOString(),
    items: order.lines.map((l) => ({
      productVariantId: l.itemId,
      productNameSnapshot: l.name,
      quantity: l.quantity,
      lineTotal: kyat(l.unitPrice * BigInt(l.quantity)),
    })),
  };
}
